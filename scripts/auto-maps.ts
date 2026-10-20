/**
 * Pipeline step — automatic character maps from public-domain full texts.
 *
 *   npm run data:auto                 # first 60 eligible books (by popularity)
 *   npm run data:auto -- --limit 500  # more
 *   npm run data:auto -- --only OL24364628W
 *
 * 1. Matches catalogue books to Project Gutenberg using Gutenberg's own
 *    public-domain catalogue file (title + author surname, English texts only).
 * 2. Downloads each text from an official Gutenberg mirror — never the main
 *    site, per https://www.gutenberg.org/policy/robot_access.html — one request
 *    every 2 seconds, cached in .cache/gutenberg/.
 * 3. Extracts characters and co-occurrence links (scripts/lib/extract-characters.ts)
 *    and writes data/auto/<workId>.json, marked `provenance.kind: "auto-text"`.
 *
 * Books with a hand-curated map are skipped, and so are plays (speaker
 * prefixes need a different parser) and non-fiction.
 */
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import nlp from 'compromise';
import type { CharacterMap, CharacterRole, Relationship } from '../src/types/map.ts';
import { extractCharacters, type Extraction } from './lib/extract-characters.ts';
import { politeFile } from './lib/polite-fetch.ts';
import { validateMap } from './lib/validate-map.ts';
import type { RawBook } from './fetch-catalog.ts';

const CATALOG_URL = 'https://www.gutenberg.org/cache/epub/feeds/pg_catalog.csv.gz';
const MIRROR = 'https://gutenberg.pglaf.org/cache/epub';
const CACHE = path.resolve('.cache/gutenberg');
const OUT = path.resolve('data/auto');

interface PgBook {
  id: number;
  title: string;
  authors: string;
  subjects: string;
  language: string;
  type: string;
}

/* ── helpers ─────────────────────────────────────────────────── */

/** Minimal RFC 4180 CSV parser (quoted fields, embedded commas/newlines). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field || row.length) rows.push([...row, field]);
  return rows;
}

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .split(/[:;(\r\n]| or, /)[0]
    .replace(/^(the|a|an)\s+/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
const surname = (name: string) =>
  norm(name)
    .split(' ')
    .filter((w) => w.length > 1)
    .pop() ?? '';

async function loadGutenbergCatalog(): Promise<Map<string, PgBook[]>> {
  const gz = await politeFile(CATALOG_URL, path.join(CACHE, 'pg_catalog.csv.gz'), { maxAgeMs: 1000 * 60 * 60 * 24 * 30 });
  const rows = parseCsv(gunzipSync(gz).toString('utf8'));
  const header = rows[0];
  const col = (n: string) => header.indexOf(n);
  const [iId, iType, iTitle, iLang, iAuth, iSubj] = ['Text#', 'Type', 'Title', 'Language', 'Authors', 'Subjects'].map(col);
  const byTitle = new Map<string, PgBook[]>();
  for (const r of rows.slice(1)) {
    const b: PgBook = { id: Number(r[iId]), type: r[iType], title: r[iTitle] ?? '', language: r[iLang] ?? '', authors: r[iAuth] ?? '', subjects: r[iSubj] ?? '' };
    if (!b.id || b.type !== 'Text' || !/\ben\b/.test(b.language)) continue;
    const k = norm(b.title);
    if (!byTitle.has(k)) byTitle.set(k, []);
    byTitle.get(k)!.push(b);
  }
  return byTitle;
}

function matchBook(book: RawBook, byTitle: Map<string, PgBook[]>): PgBook | undefined {
  const candidates = byTitle.get(norm(book.title)) ?? [];
  const surnames = book.authors.map(surname).filter(Boolean);
  const hits = candidates.filter((c) => surnames.some((s) => norm(c.authors).includes(s)));
  // The lowest ebook number is usually the canonical edition.
  return hits.sort((a, b) => a.id - b.id)[0];
}

const isFiction = (b: PgBook) => /fiction|novel|stories|tales|romance|adventure/i.test(b.subjects);
const isDrama = (b: PgBook) => /drama|tragedies|comedies|plays\b/i.test(b.subjects);

/* ── extraction → character map ──────────────────────────────── */

const STRENGTH = [
  { at: 1, label: 'Appear together' },
  { at: 12, label: 'Often together' },
  { at: 40, label: 'Constantly together' },
];

export function toCharacterMap(x: Extraction, book: RawBook, pg: PgBook, today: string): CharacterMap {
  const top = x.characters[0]?.mentions ?? 1;
  const role = (m: number): CharacterRole => (m >= top * 0.6 ? 'protagonist' : m >= top * 0.22 ? 'major' : m >= top * 0.07 ? 'supporting' : 'minor');

  // Shared surnames become groups ("Bennet name"), skipping tokens that are really first names.
  const counts = new Map<string, number>();
  for (const c of x.characters) if (c.surname) counts.set(c.surname, (counts.get(c.surname) ?? 0) + 1);
  const groupNames = [...counts.entries()].filter(([s, n]) => n >= 2 && !nlp(s).has('#FirstName')).map(([s]) => s);
  const groups = groupNames.map((s) => ({ id: `g-${s.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, label: `${s} (shared surname)` }));
  const groupOf = (s?: string) => (s && groupNames.includes(s) ? `g-${s.toLowerCase().replace(/[^a-z0-9]+/g, '-')}` : undefined);

  const sec = (i: number) => x.sections[i].id;
  const relationships: Relationship[] = x.links.map((l, i) => {
    // Phases appear at the section where cumulative shared passages cross each threshold.
    const phases: Relationship['phases'] = [];
    let total = 0;
    let level = 0;
    for (let s = 0; s < x.sections.length; s++) {
      if (!l.perSection[s]) continue;
      total += l.perSection[s];
      while (level < STRENGTH.length && total >= STRENGTH[level].at) {
        phases.push({
          at: sec(s),
          type: 'together',
          label: STRENGTH[level].label,
          weight: total,
          ...(level === 0 ? { note: `First named together in ${x.sections[s].label}.` } : {}),
        });
        level++;
      }
    }
    // Several thresholds crossed in one section collapse to the strongest.
    const deduped = phases.filter((p, j) => j === phases.length - 1 || phases[j + 1].at !== p.at);
    return { id: `r${i + 1}`, source: l.a, target: l.b, weight: l.weight, phases: deduped };
  });

  return {
    schemaVersion: 1,
    workId: book.id,
    title: book.title,
    authors: book.authors,
    ...(book.year ? { firstPublished: book.year } : {}),
    edition: {
      description: `Sections as detected in Project Gutenberg eBook #${pg.id}${x.stats.fallbackSections ? ' (no chapter headings found, so the text is split into equal parts)' : ''}.`,
      source: `Project Gutenberg eBook #${pg.id}`,
      url: `https://www.gutenberg.org/ebooks/${pg.id}`,
    },
    sectionLabel: x.sectionKind,
    sections: x.sections,
    ...(groups.length ? { groups } : {}),
    characters: x.characters.map((c) => ({
      id: c.id,
      name: c.name,
      ...(c.aliases.length ? { aliases: c.aliases } : {}),
      role: role(c.mentions),
      ...(groupOf(c.surname) ? { group: groupOf(c.surname) } : {}),
      firstAppearance: sec(c.firstSection),
      summary: c.firstSentence ? `First mention: “${c.firstSentence}”` : 'First mentioned here.',
    })),
    relationships,
    provenance: {
      kind: 'auto-text',
      method:
        'Extracted automatically from the full public-domain text. Characters are recurring names with evidence of being people; a link means two names appear in the same or adjacent paragraphs, growing stronger as they share more passages. The kind of relationship is not inferred. Expect missed nicknames, occasional duplicates (a title and a first name for one person) and the odd non-character.',
      contributors: ['Character Chart auto-extractor v1'],
      createdAt: today,
      updatedAt: today,
      review: { status: 'unreviewed', notes: 'Generated automatically; not checked by a person.' },
    },
    license: 'CC BY 4.0 (map data). Source text: public domain.',
  };
}

/* ── main ────────────────────────────────────────────────────── */

async function main() {
  const args = process.argv.slice(2);
  const limit = Number(args[args.indexOf('--limit') + 1]) || 60;
  const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : undefined;
  const today = new Date().toISOString().slice(0, 10);

  const catalog = JSON.parse(await readFile('data/catalog/openlibrary.json', 'utf8')) as { books: RawBook[] };
  const curated = new Set((await readdir('data/maps')).filter((f) => f.endsWith('.json')).map((f) => f.replace('.json', '')));
  console.log('Loading the Project Gutenberg catalogue…');
  const pg = await loadGutenbergCatalog();
  await mkdir(OUT, { recursive: true });

  let done = 0;
  const skipped: string[] = [];
  for (const book of catalog.books) {
    if (done >= limit) break;
    if (only && book.id !== only) continue;
    if (curated.has(book.id)) continue;
    const match = matchBook(book, pg);
    if (!match || !isFiction(match) || isDrama(match)) continue;

    process.stdout.write(`${book.title.slice(0, 40).padEnd(40)} PG#${String(match.id).padEnd(6)} `);
    try {
      // Short timeout and one retry: a book the mirror lacks shouldn't stall the whole run.
      const buf = await politeFile(`${MIRROR}/${match.id}/pg${match.id}.txt`, path.join(CACHE, `${match.id}.txt`), { timeoutMs: 30_000, retries: 1 });
      const extraction = extractCharacters(buf.toString('utf8'));
      const map = toCharacterMap(extraction, book, match, today);
      if (map.characters.length < 5 || map.relationships.length < 4 || map.sections.length < 3) {
        console.log(`skipped (too little structure: ${map.characters.length} characters, ${map.relationships.length} links)`);
        skipped.push(book.title);
        continue;
      }
      const { errors } = validateMap(map, `${book.id}.json`);
      if (errors.length) {
        console.log(`skipped (invalid: ${errors[0]})`);
        skipped.push(book.title);
        continue;
      }
      await writeFile(path.join(OUT, `${book.id}.json`), JSON.stringify(map, null, 1) + '\n');
      done++;
      console.log(`✓ ${map.characters.length} characters, ${map.relationships.length} links, ${map.sections.length} ${map.sectionLabel.plural.toLowerCase()}`);
    } catch (e) {
      console.log(`failed: ${(e as Error).message}`);
    }
  }
  console.log(`\n${done} automatic map(s) written to data/auto/. ${skipped.length} skipped.`);
  console.log('Next: npm run data:build');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
