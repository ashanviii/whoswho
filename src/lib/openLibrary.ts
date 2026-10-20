/**
 * Browser client for the public Open Library API (no key, CORS-enabled).
 *
 * Being a good API citizen:
 *  - every response is cached in memory and in localStorage (7-day TTL,
 *    bounded size), so repeat visits make no network requests;
 *  - requests go through a small queue: at most 2 in flight and at least
 *    350 ms between starts, far below Open Library's limits;
 *  - 429 / 5xx responses back off exponentially before retrying;
 *  - covers are loaded by numeric cover id, which Open Library does not
 *    rate-limit (ISBN/OLID cover lookups are limited and are never used).
 */
import type { BookMeta } from '../types/catalog';
import { keysWithPrefix, readJSON, removeKey, writeJSON } from './storage';

const API = 'https://openlibrary.org';
const COVERS = 'https://covers.openlibrary.org';
const CACHE_PREFIX = 'cc:ol:';
const TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_CACHED = 150;
const MAX_CONCURRENT = 2;
const MIN_GAP_MS = 350;

interface CacheEntry<T> {
  t: number;
  v: T;
}

const memory = new Map<string, unknown>();
const inflight = new Map<string, Promise<unknown>>();

export class OpenLibraryError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'OpenLibraryError';
  }
}

/* ── request queue ─────────────────────────────────────────────── */
let active = 0;
let lastStart = 0;
const waiting: (() => void)[] = [];

function acquire(): Promise<void> {
  return new Promise((resolve) => {
    const tryStart = () => {
      const gap = lastStart + MIN_GAP_MS - Date.now();
      if (active < MAX_CONCURRENT && gap <= 0) {
        active++;
        lastStart = Date.now();
        resolve();
      } else if (active < MAX_CONCURRENT) {
        setTimeout(tryStart, gap);
      } else {
        waiting.push(tryStart);
      }
    };
    tryStart();
  });
}
function release() {
  active--;
  waiting.shift()?.();
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/* ── cache ─────────────────────────────────────────────────────── */
function cacheGet<T>(url: string): T | undefined {
  if (memory.has(url)) return memory.get(url) as T;
  const entry = readJSON<CacheEntry<T> | null>(CACHE_PREFIX + url, null);
  if (entry && Date.now() - entry.t < TTL_MS) {
    memory.set(url, entry.v);
    return entry.v;
  }
  return undefined;
}

function cacheSet(url: string, value: unknown) {
  memory.set(url, value);
  const keys = keysWithPrefix(CACHE_PREFIX);
  if (keys.length >= MAX_CACHED) {
    // Evict the oldest ~20% of entries.
    keys
      .map((k) => ({ k, t: readJSON<CacheEntry<unknown> | null>(k, null)?.t ?? 0 }))
      .sort((a, b) => a.t - b.t)
      .slice(0, Math.ceil(MAX_CACHED * 0.2))
      .forEach(({ k }) => removeKey(k));
  }
  writeJSON(CACHE_PREFIX + url, { t: Date.now(), v: value } satisfies CacheEntry<unknown>);
}

/* ── fetch ─────────────────────────────────────────────────────── */
/**
 * Cached, queued GET. Concurrent callers for the same URL share one request;
 * each caller's `signal` only cancels its own wait, never the shared request
 * (whose result is cached for the next visit anyway).
 */
export function olFetch<T>(path: string, signal?: AbortSignal): Promise<T> {
  const url = API + path;
  const cached = cacheGet<T>(url);
  if (cached !== undefined) return Promise.resolve(cached);

  let p = inflight.get(url) as Promise<T> | undefined;
  if (!p) {
    p = request<T>(url).finally(() => inflight.delete(url));
    inflight.set(url, p);
  }
  return signal ? withAbort(p, signal) : p;
}

function withAbort<T>(p: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new DOMException('Aborted', 'AbortError'));
    signal.addEventListener('abort', onAbort, { once: true });
    p.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
}

async function request<T>(url: string): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    await acquire();
    let res: Response;
    try {
      res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(20_000) });
    } catch {
      if (attempt >= 2) throw new OpenLibraryError('Could not reach Open Library. Check your connection.');
      await sleep(1000 * 2 ** attempt);
      continue;
    } finally {
      release();
    }
    if (res.ok) {
      const data = (await res.json()) as T;
      cacheSet(url, data);
      return data;
    }
    if (res.status === 404) throw new OpenLibraryError('Not found on Open Library.', 404);
    if ((res.status === 429 || res.status >= 500) && attempt < 2) {
      await sleep(1500 * 2 ** attempt);
      continue;
    }
    throw new OpenLibraryError(
      res.status === 429 ? 'Open Library is busy right now. Please try again in a minute.' : `Open Library returned an error (${res.status}).`,
      res.status,
    );
  }
}

/* ── helpers ───────────────────────────────────────────────────── */
export function coverUrl(coverId: number | undefined, size: 'S' | 'M' | 'L' = 'M'): string | undefined {
  return coverId ? `${COVERS}/b/id/${coverId}-${size}.jpg` : undefined;
}

export const openLibraryWorkUrl = (id: string) => `https://openlibrary.org/works/${id}`;

interface SearchDoc {
  key: string;
  title: string;
  author_name?: string[];
  first_publish_year?: number;
  cover_i?: number;
  edition_count?: number;
}

/** Live title/author search, used only when the local catalogue has no match. */
export async function searchOpenLibrary(query: string, signal?: AbortSignal): Promise<BookMeta[]> {
  const params = new URLSearchParams({
    q: query.trim(),
    fields: 'key,title,author_name,first_publish_year,cover_i,edition_count',
    limit: '24',
  });
  const data = await olFetch<{ docs: SearchDoc[] }>(`/search.json?${params}`, signal);
  return data.docs
    .filter((d) => d.key?.startsWith('/works/'))
    .map((d) => ({
      id: d.key.replace('/works/', ''),
      title: d.title,
      authors: d.author_name?.slice(0, 3) ?? [],
      year: d.first_publish_year,
      coverId: d.cover_i,
      editions: d.edition_count,
      genres: [],
      mapped: false,
      inCatalog: false,
    }));
}

interface WorkJSON {
  title?: string;
  description?: string | { value: string };
  subjects?: string[];
  covers?: number[];
  first_publish_date?: string;
  authors?: { author?: { key: string } }[];
}

export interface WorkDetails {
  title?: string;
  description?: string;
  subjects: string[];
  coverId?: number;
  firstPublished?: string;
  authorKeys: string[];
}

export async function getWork(id: string, signal?: AbortSignal): Promise<WorkDetails> {
  const w = await olFetch<WorkJSON>(`/works/${encodeURIComponent(id)}.json`, signal);
  const raw = typeof w.description === 'string' ? w.description : w.description?.value;
  return {
    title: w.title,
    description: raw ? cleanDescription(raw) : undefined,
    subjects: (w.subjects ?? []).slice(0, 12),
    coverId: w.covers?.find((c) => c > 0),
    firstPublished: w.first_publish_date,
    authorKeys: (w.authors ?? []).map((a) => a.author?.key).filter((k): k is string => !!k),
  };
}

export async function getAuthorName(key: string, signal?: AbortSignal): Promise<string | undefined> {
  const a = await olFetch<{ name?: string }>(`${key}.json`, signal);
  return a.name;
}

/** Strip Open Library's markdown links, source footers and excess whitespace. */
export function cleanDescription(text: string): string {
  return text
    .replace(/\r/g, '')
    .split(/\n-{3,}\n|\n\(\[source\]|\n\*\*Contains\*\*/i)[0]
    .replace(/\[([^\]]+)\]\[\d+\]/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^\s*\[\d+\]:.*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
