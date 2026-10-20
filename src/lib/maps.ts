/** Loads character maps (static JSON produced by `npm run data:build`). */
import type { CharacterMap, MapSummary } from '../types/map';
import { dataUrl } from './paths';

let indexPromise: Promise<MapSummary[]> | null = null;
const mapCache = new Map<string, Promise<CharacterMap | null>>();

export function loadMapIndex(): Promise<MapSummary[]> {
  indexPromise ??= fetch(dataUrl('maps/index.json'))
    .then((res) => {
      if (!res.ok) throw new Error(`Could not load the map index (HTTP ${res.status}).`);
      return res.json() as Promise<MapSummary[]>;
    })
    .catch((err) => {
      indexPromise = null;
      throw err;
    });
  return indexPromise;
}

/** Resolves to `null` when no map exists for the work. */
export function loadMap(workId: string): Promise<CharacterMap | null> {
  let p = mapCache.get(workId);
  if (!p) {
    p = fetch(dataUrl(`maps/${encodeURIComponent(workId)}.json`))
      .then(async (res) => {
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(`Could not load the character map (HTTP ${res.status}).`);
        // Dev servers answer unknown paths with index.html — treat as "no map".
        if (!res.headers.get('content-type')?.includes('json')) return null;
        return (await res.json()) as CharacterMap;
      })
      .catch((err) => {
        mapCache.delete(workId);
        throw err;
      });
    mapCache.set(workId, p);
  }
  return p;
}
