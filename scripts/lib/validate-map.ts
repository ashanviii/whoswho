/**
 * Structural + referential validation for character maps.
 * Errors block the build; warnings are printed but allowed.
 */
import { CHARACTER_ROLES, MAP_KINDS, RELATION_TYPES, type CharacterMap } from '../../src/types/map.ts';

export interface ValidationResult {
  errors: string[];
  warnings: string[];
}

const ID_RE = /^[A-Za-z0-9_.-]+$/;
const WORK_RE = /^OL\d+W$/;

export function validateMap(input: unknown, fileName = 'map'): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const err = (m: string) => errors.push(`${fileName}: ${m}`);
  const warn = (m: string) => warnings.push(`${fileName}: ${m}`);

  if (!input || typeof input !== 'object') {
    err('not an object');
    return { errors, warnings };
  }
  const map = input as CharacterMap;

  if (map.schemaVersion !== 1) err(`schemaVersion must be 1 (got ${String(map.schemaVersion)})`);
  if (!WORK_RE.test(map.workId ?? '')) err(`workId "${map.workId}" is not an Open Library work id like OL123W`);
  if (fileName.endsWith('.json') && !fileName.startsWith(map.workId)) warn(`file name should be ${map.workId}.json`);
  if (!map.title) err('title is required');
  if (!Array.isArray(map.authors) || map.authors.length === 0) err('authors must be a non-empty array');
  if (!map.edition?.description) err('edition.description is required (which text do section numbers follow?)');
  if (!map.sectionLabel?.singular || !map.sectionLabel?.plural) err('sectionLabel.singular/plural are required');
  if (!map.license) err('license is required');

  const prov = map.provenance;
  if (!prov?.method || !Array.isArray(prov.contributors) || !prov.createdAt || !prov.updatedAt) {
    err('provenance.method, contributors, createdAt and updatedAt are required');
  }
  if (prov?.kind !== undefined && !MAP_KINDS.includes(prov.kind)) err(`provenance.kind must be one of ${MAP_KINDS.join(', ')}`);
  if (!prov?.review || !['unreviewed', 'reviewed'].includes(prov.review.status)) {
    err('provenance.review.status must be "unreviewed" or "reviewed"');
  } else if (prov.review.status === 'reviewed' && !prov.review.reviewedBy?.length) {
    err('a reviewed map must list provenance.review.reviewedBy');
  }

  // Sections
  const sectionIndex = new Map<string, number>();
  if (!Array.isArray(map.sections) || map.sections.length === 0) err('sections must be a non-empty array');
  (map.sections ?? []).forEach((s, i) => {
    if (!s.id || !ID_RE.test(s.id)) err(`sections[${i}] has invalid id "${s.id}"`);
    if (!s.label) err(`section ${s.id} needs a label`);
    if (sectionIndex.has(s.id)) err(`duplicate section id "${s.id}"`);
    sectionIndex.set(s.id, i);
  });
  const sec = (id: string, where: string): number => {
    const idx = sectionIndex.get(id);
    if (idx === undefined) {
      err(`${where} refers to unknown section "${id}"`);
      return -1;
    }
    return idx;
  };

  // Groups
  const groupIds = new Set<string>();
  for (const g of map.groups ?? []) {
    if (!g.id || !g.label) err('every group needs id and label');
    if (groupIds.has(g.id)) err(`duplicate group id "${g.id}"`);
    groupIds.add(g.id);
  }

  // Characters
  const chars = new Map<string, number>();
  if (!Array.isArray(map.characters) || map.characters.length === 0) err('characters must be a non-empty array');
  for (const c of map.characters ?? []) {
    const where = `character "${c.id}"`;
    if (!c.id || !ID_RE.test(c.id)) err(`invalid character id "${c.id}"`);
    if (chars.has(c.id)) err(`duplicate character id "${c.id}"`);
    if (!c.name) err(`${where} needs a name`);
    if (!c.summary) err(`${where} needs a summary`);
    if (!CHARACTER_ROLES.includes(c.role)) err(`${where} has invalid role "${c.role}"`);
    if (c.group && !groupIds.has(c.group)) err(`${where} refers to unknown group "${c.group}"`);
    const first = sec(c.firstAppearance, `${where}.firstAppearance`);
    chars.set(c.id, first);
    let prev = first;
    for (const n of c.notes ?? []) {
      const at = sec(n.at, `${where} note`);
      if (at >= 0 && first >= 0 && at < first) err(`${where} has a note at "${n.at}", before the character appears`);
      if (at >= 0 && at < prev) warn(`${where} notes are not in reading order`);
      if (!n.text) err(`${where} has an empty note`);
      prev = Math.max(prev, at);
    }
  }

  // Relationships
  const relIds = new Set<string>();
  const pairs = new Set<string>();
  for (const r of map.relationships ?? []) {
    const where = `relationship "${r.id}" (${r.source} → ${r.target})`;
    if (!r.id || relIds.has(r.id)) err(`missing or duplicate relationship id "${r.id}"`);
    relIds.add(r.id);
    if (!chars.has(r.source)) err(`${where}: unknown source`);
    if (!chars.has(r.target)) err(`${where}: unknown target`);
    if (r.source === r.target) err(`${where}: a character cannot be related to themself`);
    const pair = [r.source, r.target].sort().join('|');
    if (pairs.has(pair)) warn(`${where}: another relationship links the same pair — prefer phases`);
    pairs.add(pair);

    if (r.weight !== undefined && (!Number.isInteger(r.weight) || r.weight < 1)) err(`${where}: weight must be a positive integer`);
    if (!Array.isArray(r.phases) || r.phases.length === 0) {
      err(`${where}: needs at least one phase`);
      continue;
    }
    let prev = -1;
    for (const p of r.phases) {
      const at = sec(p.at, `${where} phase`);
      if (!RELATION_TYPES.includes(p.type)) err(`${where}: invalid type "${p.type}"`);
      if (!p.label) err(`${where}: phase at "${p.at}" needs a label`);
      if (at >= 0 && at < prev) err(`${where}: phases must be in reading order`);
      prev = Math.max(prev, at);
    }
    const firstAt = sectionIndex.get(r.phases[0].at) ?? -1;
    const appear = Math.max(chars.get(r.source) ?? -1, chars.get(r.target) ?? -1);
    if (firstAt >= 0 && appear >= 0 && firstAt < appear) {
      warn(`${where}: revealed at "${r.phases[0].at}" before both characters have appeared; it will stay hidden until then`);
    }
  }

  // Orphans
  const linked = new Set((map.relationships ?? []).flatMap((r) => [r.source, r.target]));
  for (const id of chars.keys()) if (!linked.has(id)) warn(`character "${id}" has no relationships`);

  return { errors, warnings };
}
