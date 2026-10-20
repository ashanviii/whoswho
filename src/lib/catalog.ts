/** Loads the static catalogue and runs fast in-browser search over it. */
import type { BookMeta, CatalogFile, CatalogRecord } from '../types/catalog';
import { dataUrl } from './paths';

export interface Catalog {
  generatedAt: string;
  genres: { id: string; label: string }[];
  books: BookMeta[];
  byId: Map<string, BookMeta>;
  /** Pre-normalised search text per book (same order as `books`). */
  haystack: { title: string; authors: string }[];
}

let promise: Promise<Catalog> | null = null;

export function loadCatalog(): Promise<Catalog> {
  promise ??= fetch(dataUrl('catalog.json'))
    .then((res) => {
      if (!res.ok) throw new Error(`Could not load the catalogue (HTTP ${res.status}).`);
      return res.json() as Promise<CatalogFile>;
    })
    .then(buildCatalog)
    .catch((err) => {
      promise = null; // allow retry
      throw err;
    });
  return promise;
}

export function buildCatalog(file: CatalogFile): Catalog {
  const books = file.books.map(toMeta);
  return {
    generatedAt: file.generatedAt,
    genres: file.genres,
    books,
    byId: new Map(books.map((b) => [b.id, b])),
    haystack: books.map((b) => ({ title: normalize(b.title), authors: normalize(b.authors.join(' ')) })),
  };
}

function toMeta(r: CatalogRecord): BookMeta {
  return {
    id: r.id,
    title: r.t,
    authors: r.a,
    year: r.y,
    coverId: r.c,
    genres: r.g,
    editions: r.e,
    mapped: !!r.m,
    mapKind: r.m === 1 ? 'curated' : r.m === 2 ? 'auto-text' : r.m === 3 ? 'wikidata' : undefined,
    inCatalog: true,
  };
}

export function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export type SortKey = 'relevance' | 'popular' | 'title' | 'newest' | 'oldest';

export interface SearchOptions {
  query?: string;
  genre?: string;
  mappedOnly?: boolean;
  sort?: SortKey;
}

const STOP = new Set(['the', 'a', 'an', 'of', 'and', 'by']);

/** Score-based search over title and author. Returns books in display order. */
export function searchCatalog(catalog: Catalog, opts: SearchOptions): BookMeta[] {
  const q = normalize(opts.query ?? '');
  const tokens = q.split(' ').filter((t) => t && !STOP.has(t));
  const sort: SortKey = opts.sort ?? (q ? 'relevance' : 'popular');
  const results: { book: BookMeta; score: number }[] = [];

  catalog.books.forEach((book, i) => {
    if (opts.mappedOnly && !book.mapped) return;
    if (opts.genre && !book.genres.includes(opts.genre)) return;
    let score = 0;
    if (q) {
      const { title, authors } = catalog.haystack[i];
      const all = `${title} ${authors}`;
      if (tokens.length === 0) {
        if (!title.includes(q)) return;
        score = 10;
      } else {
        if (!tokens.every((t) => all.includes(t))) return;
        if (title === q) score += 100;
        else if (title.startsWith(q)) score += 60;
        else if (title.includes(q)) score += 35;
        if (tokens.every((t) => title.includes(t))) score += 25;
        if (authors.includes(q)) score += 45;
        // whole-word matches beat substrings ("emma" vs "gemma")
        const words = new Set(all.split(' '));
        score += tokens.filter((t) => words.has(t)).length * 6;
      }
    }
    score += Math.log10((book.editions ?? 1) + 1) * 4 + (book.mapKind === 'curated' ? 8 : book.mapped ? 4 : 0);
    results.push({ book, score });
  });

  const cmp: Record<SortKey, (a: (typeof results)[0], b: (typeof results)[0]) => number> = {
    relevance: (a, b) => b.score - a.score,
    popular: (a, b) => (b.book.editions ?? 0) - (a.book.editions ?? 0),
    title: (a, b) => a.book.title.localeCompare(b.book.title),
    newest: (a, b) => (b.book.year ?? -1e4) - (a.book.year ?? -1e4),
    oldest: (a, b) => (a.book.year ?? 1e4) - (b.book.year ?? 1e4),
  };
  return results.sort(cmp[sort]).map((r) => r.book);
}
