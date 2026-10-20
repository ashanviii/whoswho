/**
 * Optional: export the catalogue and all valid maps as SQL INSERTs matching
 * schema/database.sql — for loading into SQLite, Cloudflare D1 or Postgres.
 *
 *   npm run data:sql               # writes data/export/seed.sql
 *   sqlite3 cc.db < schema/database.sql && sqlite3 cc.db < data/export/seed.sql
 */
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { CharacterMap } from '../src/types/map.ts';
import type { RawBook } from './fetch-catalog.ts';
import { validateMap } from './lib/validate-map.ts';

const q = (v: unknown): string => {
  if (v === undefined || v === null) return 'NULL';
  if (typeof v === 'number') return String(v);
  return `'${String(v).replace(/'/g, "''")}'`;
};
const row = (table: string, values: unknown[]) => `INSERT INTO ${table} VALUES (${values.map(q).join(', ')});`;

async function main() {
  const raw = JSON.parse(await readFile('data/catalog/openlibrary.json', 'utf8')) as { generatedAt: string; books: RawBook[] };
  const out: string[] = ['BEGIN;'];

  const workIds = new Set<string>();
  for (const b of raw.books) {
    workIds.add(b.id);
    out.push(row('works', [b.id, b.title, JSON.stringify(b.authors), b.year, b.coverId, b.editions, JSON.stringify(b.genres), raw.generatedAt]));
  }

  const files = (await readdir('data/maps')).filter((f) => f.endsWith('.json'));
  let mapCount = 0;
  for (const file of files) {
    const map = JSON.parse(await readFile(path.join('data/maps', file), 'utf8')) as CharacterMap;
    if (validateMap(map, file).errors.length) {
      console.warn(`Skipping invalid map ${file}`);
      continue;
    }
    mapCount++;
    if (!workIds.has(map.workId)) {
      out.push(row('works', [map.workId, map.title, JSON.stringify(map.authors), map.firstPublished, null, null, '[]', raw.generatedAt]));
    }
    const p = map.provenance;
    out.push(
      row('maps', [
        map.workId, p.kind ?? 'curated', map.schemaVersion, JSON.stringify(map.edition), map.sectionLabel.singular, map.sectionLabel.plural, p.method,
        JSON.stringify(p.contributors), p.review.status, p.review.reviewedBy ? JSON.stringify(p.review.reviewedBy) : null,
        p.review.reviewedAt, map.license, p.createdAt, p.updatedAt,
      ]),
    );
    map.sections.forEach((s, i) => out.push(row('sections', [map.workId, s.id, i, s.label, s.title, s.part])));
    for (const g of map.groups ?? []) out.push(row('character_groups', [map.workId, g.id, g.label]));
    for (const c of map.characters) {
      out.push(row('characters', [map.workId, c.id, c.name, JSON.stringify(c.aliases ?? []), c.role, c.group, c.firstAppearance, c.summary]));
      (c.notes ?? []).forEach((n, i) => out.push(row('character_notes', [map.workId, c.id, i, n.at, n.text])));
    }
    for (const r of map.relationships) {
      out.push(row('relationships', [map.workId, r.id, r.source, r.target, r.weight]));
      r.phases.forEach((ph, i) =>
        out.push(row('relationship_phases', [map.workId, r.id, i, ph.at, ph.type, ph.label, ph.sourceRole, ph.targetRole, ph.note])),
      );
    }
  }
  out.push('COMMIT;');

  await mkdir('data/export', { recursive: true });
  await writeFile('data/export/seed.sql', out.join('\n') + '\n');
  console.log(`Wrote data/export/seed.sql (${raw.books.length} works, ${mapCount} maps, ${out.length} statements)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
