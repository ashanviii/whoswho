/**
 * Compact catalogue record served from /data/catalog.json.
 * Keys are short because the file holds thousands of rows.
 */
export interface CatalogRecord {
  /** Open Library work id, e.g. "OL66554W" */
  id: string;
  /** Title */
  t: string;
  /** Author names */
  a: string[];
  /** First publish year */
  y?: number;
  /** Open Library cover id */
  c?: number;
  /** Genre ids (see CatalogFile.genres) */
  g: string[];
  /** Edition count (popularity proxy) */
  e?: number;
  /** Character map available: 1 curated, 2 auto-extracted from text, 3 from Wikidata */
  m?: 1 | 2 | 3;
}

export interface CatalogFile {
  version: 1;
  generatedAt: string;
  source: string;
  genres: { id: string; label: string }[];
  books: CatalogRecord[];
}

/** Normalised book metadata used by the UI (catalogue or live Open Library). */
export interface BookMeta {
  id: string;
  title: string;
  authors: string[];
  year?: number;
  coverId?: number;
  genres: string[];
  editions?: number;
  mapped: boolean;
  /** Which kind of map, when `mapped`. */
  mapKind?: 'curated' | 'auto-text' | 'wikidata';
  inCatalog: boolean;
}
