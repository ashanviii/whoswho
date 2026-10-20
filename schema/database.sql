-- Character Chart — relational schema (SQLite / Cloudflare D1 / PostgreSQL compatible).
--
-- The app ships as static JSON and needs no database. This schema is for when
-- the catalogue or the number of maps outgrows static files (e.g. tens of
-- thousands of maps, community editing, moderation queues). Load it with
-- `npm run data:sql`, which emits INSERT statements generated from data/.

CREATE TABLE IF NOT EXISTS works (
  work_id         TEXT PRIMARY KEY,              -- Open Library work id, e.g. OL66554W
  title           TEXT NOT NULL,
  authors         TEXT NOT NULL,                 -- JSON array of names
  first_published INTEGER,
  cover_id        INTEGER,
  edition_count   INTEGER,
  genres          TEXT NOT NULL DEFAULT '[]',    -- JSON array of genre ids
  fetched_at      TEXT NOT NULL                  -- when metadata was last pulled from Open Library
);
CREATE INDEX IF NOT EXISTS idx_works_title ON works (title);

-- One curated map per work (and per edition numbering).
CREATE TABLE IF NOT EXISTS maps (
  work_id          TEXT PRIMARY KEY REFERENCES works (work_id),
  kind             TEXT NOT NULL DEFAULT 'curated' CHECK (kind IN ('curated', 'auto-text', 'wikidata')),
  schema_version   INTEGER NOT NULL,
  edition          TEXT NOT NULL,                -- JSON: { description, source, url }
  section_singular TEXT NOT NULL,
  section_plural   TEXT NOT NULL,
  method           TEXT NOT NULL,
  contributors     TEXT NOT NULL,                -- JSON array
  review_status    TEXT NOT NULL CHECK (review_status IN ('unreviewed', 'reviewed')),
  reviewed_by      TEXT,                         -- JSON array
  reviewed_at      TEXT,
  license          TEXT NOT NULL,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sections (
  work_id    TEXT NOT NULL REFERENCES maps (work_id) ON DELETE CASCADE,
  section_id TEXT NOT NULL,
  ordinal    INTEGER NOT NULL,                   -- reading order, 0-based
  label      TEXT NOT NULL,
  title      TEXT,
  part       TEXT,
  PRIMARY KEY (work_id, section_id),
  UNIQUE (work_id, ordinal)
);

CREATE TABLE IF NOT EXISTS character_groups (
  work_id  TEXT NOT NULL REFERENCES maps (work_id) ON DELETE CASCADE,
  group_id TEXT NOT NULL,
  label    TEXT NOT NULL,
  PRIMARY KEY (work_id, group_id)
);

CREATE TABLE IF NOT EXISTS characters (
  work_id          TEXT NOT NULL REFERENCES maps (work_id) ON DELETE CASCADE,
  character_id     TEXT NOT NULL,
  name             TEXT NOT NULL,
  aliases          TEXT NOT NULL DEFAULT '[]',   -- JSON array
  role             TEXT NOT NULL CHECK (role IN ('protagonist', 'major', 'supporting', 'minor')),
  group_id         TEXT,
  first_appearance TEXT NOT NULL,                -- section_id
  summary          TEXT NOT NULL,
  PRIMARY KEY (work_id, character_id),
  FOREIGN KEY (work_id, first_appearance) REFERENCES sections (work_id, section_id)
);

-- Spoiler-gated facts about a character.
CREATE TABLE IF NOT EXISTS character_notes (
  work_id      TEXT NOT NULL,
  character_id TEXT NOT NULL,
  ordinal      INTEGER NOT NULL,
  at_section   TEXT NOT NULL,
  text         TEXT NOT NULL,
  PRIMARY KEY (work_id, character_id, ordinal),
  FOREIGN KEY (work_id, character_id) REFERENCES characters (work_id, character_id) ON DELETE CASCADE,
  FOREIGN KEY (work_id, at_section) REFERENCES sections (work_id, section_id)
);

CREATE TABLE IF NOT EXISTS relationships (
  work_id         TEXT NOT NULL REFERENCES maps (work_id) ON DELETE CASCADE,
  relationship_id TEXT NOT NULL,
  source_id       TEXT NOT NULL,
  target_id       TEXT NOT NULL,
  weight          INTEGER,
  PRIMARY KEY (work_id, relationship_id),
  FOREIGN KEY (work_id, source_id) REFERENCES characters (work_id, character_id),
  FOREIGN KEY (work_id, target_id) REFERENCES characters (work_id, character_id),
  CHECK (source_id <> target_id)
);

-- How a relationship changes over the course of the book.
CREATE TABLE IF NOT EXISTS relationship_phases (
  work_id         TEXT NOT NULL,
  relationship_id TEXT NOT NULL,
  ordinal         INTEGER NOT NULL,
  at_section      TEXT NOT NULL,
  type            TEXT NOT NULL CHECK (type IN ('family', 'romance', 'friendship', 'rivalry', 'alliance', 'mentorship', 'service', 'acquaintance', 'together')),
  label           TEXT NOT NULL,
  source_role     TEXT,
  target_role     TEXT,
  note            TEXT,
  PRIMARY KEY (work_id, relationship_id, ordinal),
  FOREIGN KEY (work_id, relationship_id) REFERENCES relationships (work_id, relationship_id) ON DELETE CASCADE,
  FOREIGN KEY (work_id, at_section) REFERENCES sections (work_id, section_id)
);

-- Example spoiler-safe query: everything a reader who has finished section ordinal :n may see.
--   SELECT c.* FROM characters c
--   JOIN sections s ON s.work_id = c.work_id AND s.section_id = c.first_appearance
--   WHERE c.work_id = :work AND s.ordinal <= :n;
