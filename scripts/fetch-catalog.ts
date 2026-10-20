/**
 * Pipeline step 1 — build the book catalogue from Open Library.
 *
 *   npm run data:catalog            # re-uses cached responses (30 days)
 *   npm run data:catalog -- --fresh # ignore the cache
 *
 * For each genre we take the most-published English-language works (by edition
 * count) and the most-shelved works (by reading-log count), merge them and
 * de-duplicate on the Open Library work id. Output: data/catalog/openlibrary.json.
 *
 * Only bibliographic metadata is fetched. No character data is generated here —
 * character maps are written and reviewed by people (see data/maps/).
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { politeJson } from './lib/polite-fetch.ts';

interface SearchDoc {
  key: string;
  title: string;
  author_name?: string[];
  first_publish_year?: number;
  cover_i?: number;
  edition_count?: number;
}
interface SearchResponse {
  numFound: number;
  docs: SearchDoc[];
}

export const GENRES: { id: string; label: string; query: string }[] = [
  { id: 'classics', label: 'Classics', query: 'subject:"classic literature"' },
  { id: 'fiction', label: 'Fiction', query: 'subject:fiction' },
  { id: 'fantasy', label: 'Fantasy', query: 'subject:fantasy' },
  { id: 'scifi', label: 'Science fiction', query: 'subject:"science fiction"' },
  { id: 'mystery', label: 'Mystery', query: 'subject:"detective and mystery stories"' },
  { id: 'thriller', label: 'Thriller', query: 'subject:thriller' },
  { id: 'romance', label: 'Romance', query: 'subject:"love stories"' },
  { id: 'historical', label: 'Historical fiction', query: 'subject:"historical fiction"' },
  { id: 'horror', label: 'Horror', query: 'subject:horror' },
  { id: 'ya', label: 'Young adult', query: 'subject:"young adult fiction"' },
  { id: 'children', label: 'Children’s', query: 'subject:"juvenile fiction"' },
  { id: 'plays', label: 'Plays', query: 'subject:"english drama"' },
];

const PER_SORT = 400; // results per genre per sort order
const PAGE = 200;
const SORTS = ['editions', 'readinglog'] as const;
const FIELDS = 'key,title,author_name,first_publish_year,cover_i,edition_count';

export interface RawBook {
  id: string;
  title: string;
  authors: string[];
  year?: number;
  coverId?: number;
  editions?: number;
  genres: string[];
}

async function main() {
  const fresh = process.argv.includes('--fresh');
  const books = new Map<string, RawBook>();

  for (const genre of GENRES) {
    for (const sort of SORTS) {
      for (let offset = 0; offset < PER_SORT; offset += PAGE) {
        const url =
          'https://openlibrary.org/search.json?' +
          new URLSearchParams({
            q: `${genre.query} language:eng`,
            fields: FIELDS,
            sort,
            limit: String(PAGE),
            offset: String(offset),
          });
        process.stdout.write(`${genre.id.padEnd(10)} ${sort.padEnd(10)} offset ${String(offset).padStart(3)} … `);
        const data = await politeJson<SearchResponse>(url, fresh ? { maxAgeMs: 0 } : {});
        let added = 0;
        for (const doc of data.docs) {
          const id = doc.key.replace('/works/', '');
          if (!doc.title || !doc.author_name?.length) continue;
          const existing = books.get(id);
          if (existing) {
            if (!existing.genres.includes(genre.id)) existing.genres.push(genre.id);
            continue;
          }
          books.set(id, {
            id,
            title: doc.title.trim(),
            authors: doc.author_name.slice(0, 3),
            year: doc.first_publish_year,
            coverId: doc.cover_i,
            editions: doc.edition_count,
            genres: [genre.id],
          });
          added++;
        }
        console.log(`${data.docs.length} docs, ${added} new (total ${books.size})`);
        if (data.docs.length < PAGE) break;
      }
    }
  }

  const out = {
    version: 1,
    generatedAt: new Date().toISOString(),
    source: 'Open Library Search API — https://openlibrary.org/developers/api',
    genres: GENRES.map(({ id, label }) => ({ id, label })),
    books: [...books.values()].sort((a, b) => (b.editions ?? 0) - (a.editions ?? 0)),
  };
  const file = path.resolve('data/catalog/openlibrary.json');
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(out, null, 1));
  console.log(`\nWrote ${out.books.length} books to ${path.relative(process.cwd(), file)}`);
  if (out.books.length < 3000) console.warn('Warning: fewer than 3,000 books — consider raising PER_SORT.');
  console.log('Next: npm run data:build');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
