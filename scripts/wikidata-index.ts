/**
 * Pipeline step — record which catalogue books Wikidata can map.
 *
 *   npm run data:wikidata
 *
 * Wikidata links many works to Open Library ids (property P648) and lists
 * their characters (P674 / P1441) with human-entered relationships between
 * them (father, sibling, spouse, enemy…). This step only *counts* what is
 * there, 50 books per query, so the catalogue can flag those books. The map
 * itself is built live in the browser (src/lib/wikidata.ts), so it is always
 * current and also works for books outside the catalogue.
 *
 * Output: data/catalog/wikidata.json
 */
import { readFile, writeFile } from 'node:fs/promises';
import { politeJson } from './lib/polite-fetch.ts';
import type { RawBook } from './fetch-catalog.ts';

const ENDPOINT = 'https://query.wikidata.org/sparql';
const BATCH = 50;
// Keep this list in sync with RELATION_PROPS in src/lib/wikidata.ts.
const PROPS = 'wdt:P22 wdt:P25 wdt:P40 wdt:P3373 wdt:P26 wdt:P451 wdt:P1038 wdt:P1066 wdt:P802 wdt:P7047 wdt:P3342 wdt:P108';
const MIN_CHARACTERS = 4;
const MIN_LINKED = 3;

interface Binding {
  olid: { value: string };
  work: { value: string };
  chars: { value: string };
  linked: { value: string };
}

async function main() {
  const catalog = JSON.parse(await readFile('data/catalog/openlibrary.json', 'utf8')) as { books: RawBook[] };
  const ids = catalog.books.map((b) => b.id);
  const works: Record<string, { q: string; characters: number; links: number }> = {};

  for (let i = 0; i < ids.length; i += BATCH) {
    const chunk = ids.slice(i, i + BATCH);
    const query = `SELECT ?olid ?work (COUNT(DISTINCT ?c) AS ?chars) (COUNT(DISTINCT ?o) AS ?linked) WHERE {
  VALUES ?olid { ${chunk.map((id) => JSON.stringify(id)).join(' ')} }
  ?work wdt:P648 ?olid .
  { ?work wdt:P674 ?c } UNION { ?c wdt:P1441 ?work }
  OPTIONAL { VALUES ?p { ${PROPS} } ?c ?p ?o . { ?work wdt:P674 ?o } UNION { ?o wdt:P1441 ?work } }
} GROUP BY ?olid ?work`;
    process.stdout.write(`books ${i + 1}–${i + chunk.length} of ${ids.length} … `);
    try {
      const res = await politeJson<{ results: { bindings: Binding[] } }>(`${ENDPOINT}?format=json&query=${encodeURIComponent(query)}`, {
        minIntervalMs: 1500,
      });
      let found = 0;
      for (const b of res.results.bindings) {
        const characters = Number(b.chars.value);
        const links = Number(b.linked.value);
        if (characters < MIN_CHARACTERS || links < MIN_LINKED) continue;
        // Several Wikidata items can share an Open Library id; keep the richest.
        const prev = works[b.olid.value];
        if (!prev || links > prev.links) {
          works[b.olid.value] = { q: b.work.value.split('/').pop()!, characters, links };
          if (!prev) found++;
        }
      }
      console.log(`${found} mappable`);
    } catch (e) {
      console.log(`failed (${(e as Error).message}) — skipping this batch`);
    }
  }

  await writeFile(
    'data/catalog/wikidata.json',
    JSON.stringify({ generatedAt: new Date().toISOString(), source: 'Wikidata Query Service (CC0)', works }, null, 1) + '\n',
  );
  console.log(`\n${Object.keys(works).length} catalogue books have Wikidata character data. Wrote data/catalog/wikidata.json`);
  console.log('Next: npm run data:build');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
