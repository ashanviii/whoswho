/**
 * Pipeline step 3 — publish static data for the web app.
 *
 *   npm run data:build
 *
 * Reads   data/catalog/openlibrary.json  (from `npm run data:catalog`)
 *         data/maps/*.json               (hand-curated character maps)
 *         data/auto/*.json               (automatic maps from `npm run data:auto`)
 *         data/catalog/wikidata.json     (Wikidata coverage from `npm run data:wikidata`, optional)
 * Writes  public/data/catalog.json       compact catalogue, mapped books flagged
 *         public/data/maps/index.json    summaries of every map
 *         public/data/maps/<workId>.json one file per map (minified)
 *
 * Maps that fail validation are skipped, so a bad file can never reach users.
 */
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { CatalogFile, CatalogRecord } from '../src/types/catalog.ts';
import type { CharacterMap, MapSummary } from '../src/types/map.ts';
import { validateMap } from './lib/validate-map.ts';
import type { RawBook } from './fetch-catalog.ts';

const RAW_CATALOG = path.resolve('data/catalog/openlibrary.json');
const MAPS_DIR = path.resolve('data/maps');
const AUTO_DIR = path.resolve('data/auto');
const WIKIDATA_INDEX = path.resolve('data/catalog/wikidata.json');
const OUT_DIR = path.resolve('public/data');

interface RawCatalog {
  generatedAt: string;
  source: string;
  genres: { id: string; label: string }[];
  books: RawBook[];
}

async function main() {
  const raw = JSON.parse(await readFile(RAW_CATALOG, 'utf8')) as RawCatalog;

  // Load + validate maps. Curated maps always win over automatic ones for the same work.
  async function loadDir(dir: string): Promise<CharacterMap[]> {
    let files: string[] = [];
    try {
      files = (await readdir(dir)).filter((f) => f.endsWith('.json'));
    } catch {
      return [];
    }
    const out: CharacterMap[] = [];
    for (const file of files) {
      const json = JSON.parse(await readFile(path.join(dir, file), 'utf8'));
      const { errors } = validateMap(json, file);
      if (errors.length) {
        console.error(`Skipping ${path.basename(dir)}/${file} (${errors.length} validation errors)`);
        continue;
      }
      out.push(json as CharacterMap);
    }
    return out;
  }
  const curated = await loadDir(MAPS_DIR);
  const curatedIds = new Set(curated.map((m) => m.workId));
  const auto = (await loadDir(AUTO_DIR)).filter((m) => !curatedIds.has(m.workId));
  const maps = [...curated, ...auto];
  const kindOf = (m: CharacterMap) => m.provenance.kind ?? 'curated';
  const mapped = new Map(maps.map((m) => [m.workId, m]));

  // Books that Wikidata can map live in the browser (characters + relationships recorded there).
  let wikidata: Record<string, { q: string; characters: number; links: number }> = {};
  try {
    wikidata = JSON.parse(await readFile(WIKIDATA_INDEX, 'utf8')).works ?? {};
  } catch {
    /* optional */
  }
  const mapFlag = (id: string): 1 | 2 | 3 | undefined => {
    const m = mapped.get(id);
    if (m) return kindOf(m) === 'curated' ? 1 : 2;
    return wikidata[id] ? 3 : undefined;
  };

  // Catalogue
  const books: CatalogRecord[] = raw.books.map((b) => ({
    id: b.id,
    t: b.title,
    a: b.authors,
    ...(b.year ? { y: b.year } : {}),
    ...(b.coverId ? { c: b.coverId } : {}),
    g: b.genres,
    ...(b.editions ? { e: b.editions } : {}),
    ...(mapFlag(b.id) ? { m: mapFlag(b.id) } : {}),
  }));
  // Mapped works missing from the Open Library pull are still listed.
  for (const m of maps) {
    if (!books.some((b) => b.id === m.workId)) {
      books.unshift({ id: m.workId, t: m.title, a: m.authors, y: m.firstPublished, g: [], m: mapFlag(m.workId) });
    }
  }
  const catalog: CatalogFile = {
    version: 1,
    generatedAt: raw.generatedAt,
    source: raw.source,
    genres: raw.genres,
    books,
  };

  await rm(path.join(OUT_DIR, 'maps'), { recursive: true, force: true });
  await mkdir(path.join(OUT_DIR, 'maps'), { recursive: true });
  await writeFile(path.join(OUT_DIR, 'catalog.json'), JSON.stringify(catalog));

  const index: MapSummary[] = maps
    .map((m) => ({
      workId: m.workId,
      title: m.title,
      authors: m.authors,
      characters: m.characters.length,
      relationships: m.relationships.length,
      sections: m.sections.length,
      sectionLabel: m.sectionLabel.plural,
      review: m.provenance.review.status,
      kind: kindOf(m),
      updatedAt: m.provenance.updatedAt,
    }))
    .sort((a, b) => a.title.localeCompare(b.title));
  await writeFile(path.join(OUT_DIR, 'maps', 'index.json'), JSON.stringify(index));
  for (const m of maps) {
    await writeFile(path.join(OUT_DIR, 'maps', `${m.workId}.json`), JSON.stringify(m));
  }

  const size = Buffer.byteLength(JSON.stringify(catalog)) / 1024;
  const n3 = books.filter((b) => b.m === 3).length;
  console.log(`catalog.json: ${books.length} books (${size.toFixed(0)} KB) — ${curated.length} curated, ${auto.length} auto-extracted, ${n3} via Wikidata`);
  console.log(`maps/: ${maps.length} map file(s) + index.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
