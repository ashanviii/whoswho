import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateMap } from '../../scripts/lib/validate-map.ts';
import type { CharacterMap } from '../types/map.ts';
import { buildCatalog, normalize, searchCatalog } from './catalog.ts';
import { buildView, roleOfOther } from './spoilers.ts';

const mapsDir = path.resolve(__dirname, '../../data/maps');
const load = (id: string) => JSON.parse(readFileSync(path.join(mapsDir, `${id}.json`), 'utf8')) as CharacterMap;
const pp = load('OL66554W');
const idx = (map: CharacterMap, id: string) => map.sections.findIndex((s) => s.id === id);

describe('spoiler engine', () => {
  it('hides characters who have not appeared yet', () => {
    const view = buildView(pp, idx(pp, 'c2'));
    const ids = view.characters.map((c) => c.id);
    expect(ids).toContain('elizabeth');
    expect(ids).not.toContain('darcy'); // first appears in chapter 3
    expect(ids).not.toContain('wickham');
    expect(view.hiddenCharacterCount).toBe(pp.characters.length - ids.length);
  });

  it('shows the latest revealed phase of a relationship only', () => {
    const before = buildView(pp, idx(pp, 'c33'));
    const rel = before.relationships.find((r) => r.source === 'darcy' && r.target === 'elizabeth')!;
    expect(rel.current.type).toBe('rivalry');
    expect(rel.hiddenPhaseCount).toBeGreaterThan(0);

    const after = buildView(pp, idx(pp, 'c58'));
    const rel2 = after.relationships.find((r) => r.id === rel.id)!;
    expect(rel2.current.label).toBe('Engaged');
    expect(rel2.hiddenPhaseCount).toBe(0);
  });

  it('never reveals a relationship before both characters are visible', () => {
    for (const file of readdirSync(mapsDir).filter((f) => f.endsWith('.json'))) {
      const map = JSON.parse(readFileSync(path.join(mapsDir, file), 'utf8')) as CharacterMap;
      for (let i = 0; i < map.sections.length; i++) {
        const view = buildView(map, i);
        const visible = new Set(view.characters.map((c) => c.id));
        for (const r of view.relationships) {
          expect(visible.has(r.source) && visible.has(r.target)).toBe(true);
        }
        for (const c of view.characters) {
          for (const n of c.visibleNotes) expect(idx(map, n.at)).toBeLessThanOrEqual(i);
        }
      }
    }
  });

  it('reveals everything at Infinity', () => {
    const view = buildView(pp, Number.POSITIVE_INFINITY);
    expect(view.characters).toHaveLength(pp.characters.length);
    expect(view.relationships).toHaveLength(pp.relationships.length);
  });

  it('describes the other person from the viewer’s side', () => {
    const view = buildView(pp, Number.POSITIVE_INFINITY);
    const r = view.relationships.find((x) => x.source === 'mrBennet' && x.target === 'elizabeth')!;
    expect(roleOfOther(r, 'elizabeth')).toBe('Father');
    expect(roleOfOther(r, 'mrBennet')).toBe('Daughter');
  });
});

describe('map validation', () => {
  it('accepts every shipped map', () => {
    for (const file of readdirSync(mapsDir).filter((f) => f.endsWith('.json'))) {
      const json = JSON.parse(readFileSync(path.join(mapsDir, file), 'utf8'));
      expect(validateMap(json, file).errors).toEqual([]);
    }
  });

  it('rejects dangling references and out-of-order phases', () => {
    const broken = structuredClone(pp);
    broken.relationships[0].target = 'nobody';
    broken.relationships[1].phases = [
      { at: 'c10', type: 'family', label: 'x' },
      { at: 'c2', type: 'family', label: 'y' },
    ];
    const { errors } = validateMap(broken, 'broken.json');
    expect(errors.some((e) => e.includes('unknown target'))).toBe(true);
    expect(errors.some((e) => e.includes('reading order'))).toBe(true);
  });
});

describe('catalogue search', () => {
  const catalog = buildCatalog({
    version: 1,
    generatedAt: '',
    source: '',
    genres: [{ id: 'classics', label: 'Classics' }],
    books: [
      { id: 'OL1W', t: 'Emma', a: ['Jane Austen'], g: ['classics'], e: 900 },
      { id: 'OL2W', t: 'Gemma Bovery', a: ['Posy Simmonds'], g: [], e: 5 },
      { id: 'OL3W', t: 'Pride and Prejudice', a: ['Jane Austen'], g: ['classics'], e: 4000, m: 1 },
      { id: 'OL4W', t: 'Les Misérables', a: ['Victor Hugo'], g: ['classics'], e: 1000 },
    ],
  });

  it('normalises accents and punctuation', () => {
    expect(normalize('Les Misérables!')).toBe('les miserables');
  });
  it('ranks exact title matches first', () => {
    expect(searchCatalog(catalog, { query: 'emma' })[0].id).toBe('OL1W');
  });
  it('matches authors and accent-free queries', () => {
    expect(searchCatalog(catalog, { query: 'austen' }).map((b) => b.id)).toEqual(expect.arrayContaining(['OL1W', 'OL3W']));
    expect(searchCatalog(catalog, { query: 'miserables' })[0].id).toBe('OL4W');
  });
  it('filters to mapped books', () => {
    expect(searchCatalog(catalog, { mappedOnly: true }).map((b) => b.id)).toEqual(['OL3W']);
  });
});
