/**
 * Live character maps from Wikidata (CC0, free, no key, CORS-enabled).
 *
 * Used when a book has no curated or text-extracted map. Wikidata records
 * characters for many works — including modern, copyrighted ones — along with
 * human-entered relationships between them (parents, siblings, spouses,
 * enemies, teachers…). It has no chapter information, so these maps are
 * clearly marked as not spoiler-safe.
 *
 * Character descriptions are then improved from English Wikipedia: Wikidata
 * tells us each character's article, and one batched API call per 20
 * characters fetches its opening sentences (credited, CC BY-SA 4.0).
 *
 * Polite use: two small SPARQL queries and one or two Wikipedia calls per
 * book, cached on this device for a week (including "nothing found").
 */
import type { BookMeta } from '../types/catalog';
import type { Character, CharacterMap, CharacterRole, Relationship, RelationType } from '../types/map';
import { readJSON, writeJSON } from './storage';

const ENDPOINT = 'https://query.wikidata.org/sparql';
// Bump the version when the cached shape changes, so old entries are ignored.
const CACHE_PREFIX = 'cc:wd2:';
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface RelDef {
  type: RelationType;
  label: string;
  /** What the subject is to the object, and vice versa. */
  subjectRole?: string;
  objectRole?: string;
  /** Lower = preferred when two statements link the same pair. */
  rank: number;
}

/** Wikidata property → how we show it. Subject is the character holding the statement. */
export const RELATION_PROPS: Record<string, RelDef> = {
  P22: { type: 'family', label: 'Father & child', subjectRole: 'Child', objectRole: 'Father', rank: 0 },
  P25: { type: 'family', label: 'Mother & child', subjectRole: 'Child', objectRole: 'Mother', rank: 0 },
  P40: { type: 'family', label: 'Parent & child', subjectRole: 'Parent', objectRole: 'Child', rank: 1 },
  P26: { type: 'romance', label: 'Spouses', subjectRole: 'Spouse', objectRole: 'Spouse', rank: 2 },
  P451: { type: 'romance', label: 'Partners', subjectRole: 'Partner', objectRole: 'Partner', rank: 3 },
  P3373: { type: 'family', label: 'Siblings', subjectRole: 'Sibling', objectRole: 'Sibling', rank: 4 },
  P1038: { type: 'family', label: 'Relatives', subjectRole: 'Relative', objectRole: 'Relative', rank: 5 },
  P1066: { type: 'mentorship', label: 'Teacher & student', subjectRole: 'Student', objectRole: 'Teacher', rank: 6 },
  P802: { type: 'mentorship', label: 'Teacher & student', subjectRole: 'Teacher', objectRole: 'Student', rank: 6 },
  P7047: { type: 'rivalry', label: 'Enemies', subjectRole: 'Enemy', objectRole: 'Enemy', rank: 7 },
  P108: { type: 'service', label: 'Employee & employer', subjectRole: 'Employee', objectRole: 'Employer', rank: 8 },
  P3342: { type: 'acquaintance', label: 'Significant person', rank: 9 },
};

/* ── tiny cached SPARQL client ─────────────────────────────── */

async function cachedJson<T>(url: string, headers: Record<string, string>, service: string, signal?: AbortSignal): Promise<T> {
  const key = CACHE_PREFIX + hash(url);
  const cached = readJSON<{ t: number; v: T } | null>(key, null);
  if (cached && Date.now() - cached.t < TTL_MS) return cached.v;

  const res = await fetch(url, { headers, signal });
  if (res.status === 429) throw new Error(`${service} is busy right now. Please try again in a minute.`);
  if (!res.ok) throw new Error(`${service} returned an error (${res.status}).`);
  const data = (await res.json()) as T;
  writeJSON(key, { t: Date.now(), v: data });
  return data;
}

async function sparql<T>(query: string, signal?: AbortSignal): Promise<T[]> {
  const url = `${ENDPOINT}?format=json&query=${encodeURIComponent(query)}`;
  const data = await cachedJson<{ results?: { bindings?: T[] } }>(url, { Accept: 'application/sparql-results+json' }, 'Wikidata', signal);
  if (!Array.isArray(data?.results?.bindings)) throw new Error('Wikidata returned an unexpected response.');
  return data.results.bindings;
}

function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

const lit = (s: string) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

/* ── lookup ─────────────────────────────────────────────────── */

type V = { value: string } | undefined;

/** Find the Wikidata item for a book: by Open Library id first, then by exact title + author surname. */
async function findWork(book: BookMeta, signal?: AbortSignal): Promise<string | null> {
  const count = `OPTIONAL { { ?work wdt:P674 ?c } UNION { ?c wdt:P1441 ?work } }`;
  const byId = await sparql<{ work: V }>(
    `SELECT ?work (COUNT(DISTINCT ?c) AS ?n) WHERE { ?work wdt:P648 ${lit(book.id)} . ${count} } GROUP BY ?work ORDER BY DESC(?n) LIMIT 1`,
    signal,
  );
  if (byId[0]?.work) return byId[0].work.value.split('/').pop()!;

  const surname = book.authors[0]?.split(/\s+/).pop()?.toLowerCase();
  if (!surname) return null;
  const title = book.title.split(/[:;(]/)[0].trim();
  const byTitle = await sparql<{ work: V }>(
    `SELECT ?work (COUNT(DISTINCT ?c) AS ?n) WHERE {
      ?work rdfs:label ${lit(title)}@en ; wdt:P50 ?author .
      ?author rdfs:label ?al . FILTER(LANG(?al) = "en" && CONTAINS(LCASE(?al), ${lit(surname)}))
      ${count}
    } GROUP BY ?work ORDER BY DESC(?n) LIMIT 1`,
    signal,
  );
  return byTitle[0]?.work ? byTitle[0].work.value.split('/').pop()! : null;
}

interface Row {
  c: V;
  cLabel: V;
  cDescription: V;
  p: V;
  o: V;
  kindLabel?: V;
  /** English Wikipedia article about the character, if any. */
  article?: V;
}

/**
 * Build a character map for `book` from Wikidata, or `null` when Wikidata
 * has too little (fewer than 3 characters with recorded relationships).
 */
export async function fetchWikidataMap(book: BookMeta, signal?: AbortSignal): Promise<CharacterMap | null> {
  const q = await findWork(book, signal);
  if (!q) return null;

  const props = Object.keys(RELATION_PROPS)
    .map((p) => `wdt:${p}`)
    .join(' ');
  // ?article: the character's English Wikipedia page. ?kind: for "relative" (P1039 qualifier: uncle, godparent…).
  // (No SPARQL comments inside the query: the endpoint rejected one combined with the article lookup.)
  const rows = await sparql<Row>(
    `SELECT ?c ?cLabel ?cDescription ?p ?o ?kindLabel ?article WHERE {
      VALUES ?work { wd:${q} }
      { ?work wdt:P674 ?c } UNION { ?c wdt:P1441 ?work }
      OPTIONAL { ?article schema:about ?c ; schema:isPartOf <https://en.wikipedia.org/> . }
      OPTIONAL {
        VALUES ?p { ${props} }
        ?c ?p ?o .
        { ?work wdt:P674 ?o } UNION { ?o wdt:P1441 ?work }
        OPTIONAL { FILTER(?p = wdt:P1038) ?c p:P1038 ?st . ?st ps:P1038 ?o ; pq:P1039 ?kind . }
      }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul". }
    }`,
    signal,
  );
  const map = buildMap(book, q, rows);
  if (!map) return null;
  // Better descriptions from Wikipedia; never let this break the map.
  try {
    return await enrichFromWikipedia(map, rows, signal);
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    return map;
  }
}

/* ── Wikipedia descriptions ─────────────────────────────────── */

const WIKIPEDIA_API = 'https://en.wikipedia.org/w/api.php';

export interface WikipediaQuery {
  normalized?: { from: string; to: string }[];
  redirects?: { from: string; to: string; tofragment?: string }[];
  pages?: { title: string; extract?: string; missing?: boolean }[];
}

const titleFromUrl = (url: string) => decodeURIComponent(url.split('/wiki/')[1] ?? '').replace(/_/g, ' ');
const articleUrl = (title: string) => `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;

/** Trim an article intro to at most ~320 characters, ending on a sentence. */
export function tidyExtract(text: string): string {
  const t = text.replace(/\s+/g, ' ').replace(/\s*\([^)]*\)/, '').trim();
  if (t.length <= 320) return t;
  const cut = t.slice(0, 320);
  const end = cut.lastIndexOf('. ');
  return end > 120 ? cut.slice(0, end + 1) : `${cut.trimEnd()}…`;
}

/**
 * Resolve each requested title through normalisation and redirects, and return
 * usable extracts. Redirects into a section ("List of … characters#Dudley")
 * and list pages are skipped: their intro describes the list, not the person.
 */
export function resolveExtracts(titles: string[], q: WikipediaQuery, bookTitle: string): Map<string, { text: string; title: string }> {
  const norm = new Map((q.normalized ?? []).map((n) => [n.from, n.to]));
  const redirect = new Map((q.redirects ?? []).map((r) => [r.from, r]));
  const pages = new Map((q.pages ?? []).map((p) => [p.title, p]));
  const out = new Map<string, { text: string; title: string }>();
  for (const original of titles) {
    let t = norm.get(original) ?? original;
    const r = redirect.get(t);
    if (r) {
      if (r.tofragment) continue;
      t = r.to;
    }
    const page = pages.get(t);
    if (!page || page.missing || !page.extract?.trim()) continue;
    if (/^list of /i.test(t) || t.toLowerCase() === bookTitle.toLowerCase()) continue;
    out.set(original, { text: tidyExtract(page.extract), title: t });
  }
  return out;
}

async function enrichFromWikipedia(map: CharacterMap, rows: Row[], signal?: AbortSignal): Promise<CharacterMap> {
  const qid = (v: V) => v?.value.split('/').pop() ?? '';
  const visible = new Set(map.characters.map((c) => c.id));
  const titleOf = new Map<string, string>();
  for (const r of rows) {
    const id = qid(r.c);
    if (visible.has(id) && r.article?.value && !titleOf.has(id)) titleOf.set(id, titleFromUrl(r.article.value));
  }
  const titles = [...new Set(titleOf.values())];
  if (titles.length === 0) return map;

  const extracts = new Map<string, { text: string; title: string }>();
  for (let i = 0; i < titles.length; i += 20) {
    const batch = titles.slice(i, i + 20);
    const params = new URLSearchParams({
      action: 'query',
      format: 'json',
      formatversion: '2',
      origin: '*',
      prop: 'extracts',
      exintro: '1',
      explaintext: '1',
      exsentences: '2',
      exlimit: 'max',
      redirects: '1',
      titles: batch.join('|'),
    });
    const data = await cachedJson<{ query?: WikipediaQuery }>(
      `${WIKIPEDIA_API}?${params}`,
      { 'Api-User-Agent': 'CharacterChart/1.0 (open-source book character explorer)' },
      'Wikipedia',
      signal,
    );
    for (const [k, v] of resolveExtracts(batch, data.query ?? {}, map.title)) extracts.set(k, v);
  }
  if (extracts.size === 0) return map;

  return {
    ...map,
    characters: map.characters.map((c) => {
      const e = titleOf.has(c.id) ? extracts.get(titleOf.get(c.id)!) : undefined;
      return e ? { ...c, summary: e.text, summarySource: { name: 'Wikipedia', url: articleUrl(e.title), license: 'CC BY-SA 4.0' } } : c;
    }),
    provenance: {
      ...map.provenance,
      method: `${map.provenance.method} Character descriptions are quoted from the opening of each character’s English Wikipedia article where one exists.`,
    },
    license: 'CC0 1.0 (Wikidata); character descriptions CC BY-SA 4.0 (Wikipedia)',
  };
}

export function buildMap(book: BookMeta, q: string, rows: Row[]): CharacterMap | null {
  const qid = (v: V) => v?.value.split('/').pop() ?? '';
  const people = new Map<string, { name: string; description?: string }>();
  for (const r of rows) {
    const id = qid(r.c);
    const name = r.cLabel?.value;
    // Unlabelled items come back as their Q-id; skip them.
    if (!id || !name || /^Q\d+$/.test(name)) continue;
    if (!people.has(id)) people.set(id, { name, description: r.cDescription?.value });
  }

  // One relationship per pair, keeping the most specific statement.
  const pairs = new Map<string, { a: string; b: string; def: RelDef; others: Set<string> }>();
  for (const r of rows) {
    const a = qid(r.c);
    const b = qid(r.o);
    let def = RELATION_PROPS[qid(r.p)];
    if (!def || !people.has(a) || !people.has(b) || a === b) continue;
    // Use the kinship qualifier when present: "Vernon Dursley — uncle".
    const kind = r.kindLabel?.value;
    if (qid(r.p) === 'P1038' && kind && !/^Q\d+$/.test(kind)) {
      const nice = kind[0].toUpperCase() + kind.slice(1);
      def = { ...def, label: nice, subjectRole: undefined, objectRole: nice, rank: /godparent|godfather|godmother/i.test(kind) ? 4.5 : def.rank };
    }
    const key = [a, b].sort().join('|');
    const prev = pairs.get(key);
    if (!prev) pairs.set(key, { a, b, def, others: new Set() });
    else if (def.rank < prev.def.rank) {
      prev.others.add(prev.def.label);
      Object.assign(prev, { a, b, def });
    } else if (def.label !== prev.def.label) prev.others.add(def.label);
  }
  if (pairs.size === 0) return null;

  const degree = new Map<string, number>();
  for (const { a, b } of pairs.values()) {
    degree.set(a, (degree.get(a) ?? 0) + 1);
    degree.set(b, (degree.get(b) ?? 0) + 1);
  }
  const linked = [...people.keys()].filter((id) => degree.has(id));
  if (linked.length < 3) return null;
  const max = Math.max(...linked.map((id) => degree.get(id)!));
  const role = (d: number): CharacterRole => (d >= max * 0.75 && d >= 4 ? 'protagonist' : d >= max * 0.4 ? 'major' : d >= 2 ? 'supporting' : 'minor');

  // Colour families: surnames shared by two or more linked characters become groups ("Weasley").
  const surnameOf = (name: string) => {
    const parts = name.replace(/\s*\(.*\)$/, '').split(/\s+/);
    return parts.length > 1 ? parts[parts.length - 1] : undefined;
  };
  const surnameCounts = new Map<string, number>();
  for (const id of linked) {
    const s = surnameOf(people.get(id)!.name);
    if (s) surnameCounts.set(s, (surnameCounts.get(s) ?? 0) + 1);
  }
  const families = [...surnameCounts.entries()].filter(([, n]) => n >= 2).map(([s]) => s);
  const groupId = (s: string) => `g-${s.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

  const characters: Character[] = linked
    .sort((x, y) => degree.get(y)! - degree.get(x)!)
    .map((id) => {
      const p = people.get(id)!;
      const family = surnameOf(p.name);
      return {
        id,
        name: p.name,
        ...(family && families.includes(family) ? { group: groupId(family) } : {}),
        role: role(degree.get(id)!),
        firstAppearance: 'all',
        summary: p.description ? p.description[0].toUpperCase() + p.description.slice(1) + '.' : 'No description on Wikidata yet.',
      };
    });

  const relationships: Relationship[] = [...pairs.values()].map(({ a, b, def, others }, i) => ({
    id: `r${i + 1}`,
    source: a,
    target: b,
    phases: [
      {
        at: 'all',
        type: def.type,
        label: def.label,
        ...(def.subjectRole ? { sourceRole: def.subjectRole } : {}),
        ...(def.objectRole ? { targetRole: def.objectRole } : {}),
        ...(others.size ? { note: `Also recorded: ${[...others].join(', ').toLowerCase()}.` } : {}),
      },
    ],
  }));

  const today = new Date().toISOString().slice(0, 10);
  const unlinked = people.size - linked.length;
  return {
    schemaVersion: 1,
    workId: book.id,
    title: book.title,
    authors: book.authors,
    ...(book.year ? { firstPublished: book.year } : {}),
    edition: {
      description: 'Not tied to any edition: Wikidata records characters and relationships without chapter information.',
      source: `Wikidata ${q}`,
      url: `https://www.wikidata.org/wiki/${q}`,
    },
    sectionLabel: { singular: 'Book', plural: 'Books' },
    sections: [{ id: 'all', label: 'Whole book' }],
    ...(families.length ? { groups: families.map((s) => ({ id: groupId(s), label: `${s} (shared surname)` })) } : {}),
    characters,
    relationships,
    provenance: {
      kind: 'wikidata',
      method: `Imported live from Wikidata, the free knowledge base anyone can edit. Characters are those Wikidata lists for this work; links are statements between them such as father, sibling, spouse or enemy.${unlinked > 0 ? ` ${unlinked} further character${unlinked === 1 ? '' : 's'} with no recorded relationships ${unlinked === 1 ? 'is' : 'are'} not shown.` : ''} Coverage depends on what volunteers have entered, and relationships may describe the end of the story.`,
      contributors: ['Wikidata contributors'],
      createdAt: today,
      updatedAt: today,
      review: { status: 'unreviewed', notes: 'Not checked by Character Chart editors.' },
    },
    license: 'CC0 1.0 (Wikidata)',
  };
}
