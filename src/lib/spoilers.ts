/**
 * Spoiler engine: given a map and the reader's progress, return only what
 * the reader is allowed to know. Pure functions — unit-tested.
 *
 * `progress` is the index (in `map.sections`) of the last section read.
 * Use `Infinity` to reveal everything.
 */
import type { Character, CharacterMap, CharacterNote, Relationship, RelationshipPhase } from '../types/map';

export interface VisibleCharacter extends Character {
  firstIndex: number;
  visibleNotes: CharacterNote[];
  hiddenNoteCount: number;
  degree: number;
}

export interface VisibleRelationship {
  id: string;
  source: string;
  target: string;
  /** Latest phase the reader has reached. */
  current: RelationshipPhase;
  /** All phases revealed so far, oldest first. */
  history: RelationshipPhase[];
  hiddenPhaseCount: number;
  firstIndex: number;
}

export interface SpoilerView {
  characters: VisibleCharacter[];
  relationships: VisibleRelationship[];
  hiddenCharacterCount: number;
  hiddenRelationshipCount: number;
}

export function sectionIndex(map: CharacterMap): Map<string, number> {
  return new Map(map.sections.map((s, i) => [s.id, i]));
}

export function buildView(map: CharacterMap, progress: number): SpoilerView {
  const idx = sectionIndex(map);
  const at = (id: string) => idx.get(id) ?? Number.POSITIVE_INFINITY;

  const visibleIds = new Set<string>();
  const chars: VisibleCharacter[] = [];
  for (const c of map.characters) {
    const firstIndex = at(c.firstAppearance);
    if (firstIndex > progress) continue;
    visibleIds.add(c.id);
    const notes = c.notes ?? [];
    const visibleNotes = notes.filter((n) => at(n.at) <= progress);
    chars.push({ ...c, firstIndex, visibleNotes, hiddenNoteCount: notes.length - visibleNotes.length, degree: 0 });
  }

  const rels: VisibleRelationship[] = [];
  for (const r of map.relationships) {
    if (!visibleIds.has(r.source) || !visibleIds.has(r.target)) continue;
    const view = relationshipAt(r, progress, at);
    if (view) rels.push(view);
  }

  const degree = new Map<string, number>();
  for (const r of rels) {
    degree.set(r.source, (degree.get(r.source) ?? 0) + 1);
    degree.set(r.target, (degree.get(r.target) ?? 0) + 1);
  }
  for (const c of chars) c.degree = degree.get(c.id) ?? 0;

  return {
    characters: chars,
    relationships: rels,
    hiddenCharacterCount: map.characters.length - chars.length,
    hiddenRelationshipCount: map.relationships.length - rels.length,
  };
}

export function relationshipAt(
  r: Relationship,
  progress: number,
  at: (sectionId: string) => number,
): VisibleRelationship | null {
  const history = r.phases.filter((p) => at(p.at) <= progress);
  if (history.length === 0) return null;
  return {
    id: r.id,
    source: r.source,
    target: r.target,
    current: history[history.length - 1],
    history,
    hiddenPhaseCount: r.phases.length - history.length,
    firstIndex: at(r.phases[0].at),
  };
}

/**
 * How `other` relates to `self` in a relationship, for profile lists
 * ("Mr. Bennet — Father").
 */
export function roleOfOther(rel: VisibleRelationship, selfId: string): string {
  const p = rel.current;
  const role = rel.source === selfId ? p.targetRole : p.sourceRole;
  return role ?? p.label;
}

export const otherEnd = (rel: VisibleRelationship, selfId: string) => (rel.source === selfId ? rel.target : rel.source);
