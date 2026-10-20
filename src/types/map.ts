/**
 * Character-map schema (schemaVersion 1).
 *
 * A map describes the characters of ONE Open Library work and the
 * relationships between them, annotated with the section (chapter / scene)
 * in which each fact becomes known to a first-time reader. Every
 * spoiler-sensitive field carries an `at` section id so the UI can hide
 * anything the reader has not reached yet.
 *
 * The JSON Schema in /schema/character-map.schema.json mirrors these types;
 * `npm run data:validate` enforces both shape and referential integrity.
 */

export const RELATION_TYPES = [
  'family',
  'romance',
  'friendship',
  'rivalry',
  'alliance',
  'mentorship',
  'service',
  'acquaintance',
  /** Auto-detected: named in the same passages; the nature of the link is unknown. */
  'together',
] as const;
export type RelationType = (typeof RELATION_TYPES)[number];

export const CHARACTER_ROLES = ['protagonist', 'major', 'supporting', 'minor'] as const;
export type CharacterRole = (typeof CHARACTER_ROLES)[number];

/** A chapter, scene, letter or other reading unit. Array order = reading order. */
export interface Section {
  id: string;
  /** Short label shown in the spoiler slider, e.g. "Ch. 12" or "3.1". */
  label: string;
  /** Optional chapter / scene title. */
  title?: string;
  /** Optional grouping such as "Volume II" or "Act 3". */
  part?: string;
}

/** A spoiler-gated fact about a character. */
export interface CharacterNote {
  /** Section id at which this becomes known. */
  at: string;
  text: string;
}

export interface Character {
  id: string;
  name: string;
  aliases?: string[];
  role: CharacterRole;
  /** Optional id from `groups` (family, house, faction...). */
  group?: string;
  /** Section in which the character first appears or is first named. */
  firstAppearance: string;
  /** Description that is safe to read at `firstAppearance`. */
  summary: string;
  /** Set when `summary` is quoted from elsewhere (e.g. Wikipedia), for attribution. */
  summarySource?: { name: string; url: string; license: string };
  /** Later developments, revealed progressively. */
  notes?: CharacterNote[];
}

/** One state of a relationship. Relationships can change as the story goes on. */
export interface RelationshipPhase {
  /** Section id at which the reader learns this. */
  at: string;
  type: RelationType;
  /** Short edge label, e.g. "Married", "Sisters", "Sworn enemies". */
  label: string;
  /** What `source` is to `target` ("Father"). Optional. */
  sourceRole?: string;
  /** What `target` is to `source` ("Daughter"). Optional. */
  targetRole?: string;
  note?: string;
  /** For automatic links: shared passages so far (drives edge thickness without spoilers). */
  weight?: number;
}

export interface Relationship {
  id: string;
  source: string;
  target: string;
  /** Ordered by `at`. The first phase marks when the link is revealed. */
  phases: RelationshipPhase[];
  /** Strength for automatically detected links (number of shared passages). */
  weight?: number;
}

export interface Group {
  id: string;
  label: string;
}

export interface ReviewRecord {
  /** `reviewed` only after a human checked every entry against the edition. */
  status: 'unreviewed' | 'reviewed';
  reviewedBy?: string[];
  reviewedAt?: string;
  notes?: string;
}

/**
 * Where a map comes from:
 *  - curated:   written by people from the text (spoiler-aware, typed relationships)
 *  - auto-text: extracted automatically from a public-domain full text (spoiler-aware, untyped links)
 *  - wikidata:  imported from Wikidata statements (typed, but no chapter data, so not spoiler-safe)
 */
export const MAP_KINDS = ['curated', 'auto-text', 'wikidata'] as const;
export type MapKind = (typeof MAP_KINDS)[number];

export interface Provenance {
  /** Defaults to "curated" when absent. */
  kind?: MapKind;
  /** How the map was produced. */
  method: string;
  contributors: string[];
  createdAt: string;
  updatedAt: string;
  review: ReviewRecord;
}

export interface CharacterMap {
  schemaVersion: 1;
  /** Open Library work id, e.g. "OL66554W". */
  workId: string;
  title: string;
  authors: string[];
  firstPublished?: number;
  /** Which text the section numbering follows. */
  edition: { description: string; source?: string; url?: string };
  sectionLabel: { singular: string; plural: string };
  sections: Section[];
  groups?: Group[];
  characters: Character[];
  relationships: Relationship[];
  provenance: Provenance;
  /** License of the map data itself (not the book). */
  license: string;
}

/** Lightweight entry in /data/maps/index.json. */
export interface MapSummary {
  workId: string;
  title: string;
  authors: string[];
  characters: number;
  relationships: number;
  sections: number;
  sectionLabel: string;
  review: ReviewRecord['status'];
  kind: MapKind;
  updatedAt: string;
}
