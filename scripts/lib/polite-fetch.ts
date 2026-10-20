/**
 * Polite, cached JSON fetcher for build-time scripts.
 *
 * - Serialises requests with a minimum interval (default 1.2 s) so we stay well
 *   under Open Library's published limits.
 * - Retries 429 / 5xx with exponential backoff and honours Retry-After.
 * - Caches every response body on disk in .cache/ so re-runs cost nothing.
 * - Sends an identifying User-Agent, as Open Library asks of API users.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const CACHE_DIR = path.resolve('.cache/http');
const contact = process.env.OL_CONTACT ?? 'contact-not-set';
const USER_AGENT = `CharacterChart/1.0 (data pipeline; ${contact})`;

let lastRequest = 0;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface FetchOptions {
  minIntervalMs?: number;
  maxAgeMs?: number;
  retries?: number;
  timeoutMs?: number;
}

/**
 * Download a file once (cached at `cachePath`), with the same pacing and retries.
 * Returns the raw bytes.
 */
export async function politeFile(url: string, cachePath: string, opts: FetchOptions = {}): Promise<Buffer> {
  const { minIntervalMs = 2000, maxAgeMs = 1000 * 60 * 60 * 24 * 90, retries = 4, timeoutMs = 120_000 } = opts;
  try {
    const s = await stat(cachePath);
    if (Date.now() - s.mtimeMs < maxAgeMs) return await readFile(cachePath);
  } catch {
    /* not cached */
  }
  for (let attempt = 0; ; attempt++) {
    const wait = lastRequest + minIntervalMs - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequest = Date.now();
    let res: Response;
    try {
      res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(timeoutMs) });
    } catch (err) {
      if (attempt >= retries) throw err;
      await sleep(2 ** attempt * 3000);
      continue;
    }
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      await mkdir(path.dirname(cachePath), { recursive: true });
      await writeFile(cachePath, buf);
      return buf;
    }
    if ((res.status === 429 || res.status >= 500) && attempt < retries) {
      await sleep(2 ** attempt * 5000);
      continue;
    }
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
}

export async function politeJson<T>(url: string, opts: FetchOptions = {}): Promise<T> {
  const { minIntervalMs = 1200, maxAgeMs = 1000 * 60 * 60 * 24 * 30, retries = 5 } = opts;
  const file = path.join(CACHE_DIR, createHash('sha1').update(url).digest('hex') + '.json');

  try {
    const s = await stat(file);
    if (Date.now() - s.mtimeMs < maxAgeMs) {
      return JSON.parse(await readFile(file, 'utf8')) as T;
    }
  } catch {
    /* cache miss */
  }

  for (let attempt = 0; ; attempt++) {
    const wait = lastRequest + minIntervalMs - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequest = Date.now();

    let res: Response;
    try {
      res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: AbortSignal.timeout(60_000),
      });
    } catch (err) {
      if (attempt >= retries) throw err;
      await sleep(2 ** attempt * 2000);
      continue;
    }

    if (res.ok) {
      const body = await res.text();
      await mkdir(CACHE_DIR, { recursive: true });
      await writeFile(file, body);
      return JSON.parse(body) as T;
    }

    if ((res.status === 429 || res.status >= 500) && attempt < retries) {
      const retryAfter = Number(res.headers.get('retry-after'));
      const delay = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2 ** attempt * 3000;
      console.warn(`  HTTP ${res.status} from Open Library, retrying in ${Math.round(delay / 1000)}s`);
      await sleep(delay);
      continue;
    }
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
}
