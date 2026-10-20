import type { CharacterRole, RelationType } from '../types/map';

export interface RelTypeMeta {
  label: string;
  /** Edge colour for light / dark themes. */
  light: string;
  dark: string;
  line: 'solid' | 'dashed' | 'dotted';
  width: number;
  description: string;
}

export const REL_TYPES: Record<RelationType, RelTypeMeta> = {
  family: { label: 'Family', light: '#2f6fd6', dark: '#7aa7f0', line: 'solid', width: 2.5, description: 'Blood relations, in-laws, guardians and wards' },
  romance: { label: 'Romance', light: '#d6336c', dark: '#f483a8', line: 'solid', width: 3.2, description: 'Courtship, love affairs and marriages' },
  friendship: { label: 'Friendship', light: '#1f9254', dark: '#5fd18f', line: 'solid', width: 2.5, description: 'Friends and confidants' },
  rivalry: { label: 'Rivalry', light: '#e0681b', dark: '#f5a05f', line: 'dashed', width: 2.5, description: 'Enemies, rivals and conflicts' },
  alliance: { label: 'Alliance', light: '#7b4fd8', dark: '#b39af2', line: 'solid', width: 2.2, description: 'Allies, partners and co-conspirators' },
  mentorship: { label: 'Mentorship', light: '#0e8fa8', dark: '#56c7dc', line: 'solid', width: 2.2, description: 'Teachers, mentors and patrons' },
  service: { label: 'Service', light: '#9a6a12', dark: '#d9a74b', line: 'dotted', width: 2.2, description: 'Employers, servants and dependants' },
  acquaintance: { label: 'Acquaintance', light: '#8a8277', dark: '#8f877c', line: 'dotted', width: 1.6, description: 'Looser or one-off connections' },
  together: { label: 'Appear together', light: '#5b7aa6', dark: '#8fa9cf', line: 'solid', width: 1.8, description: 'Detected automatically: named in the same passages (type unknown)' },
};

export const ROLE_LABEL: Record<CharacterRole, string> = {
  protagonist: 'Protagonist',
  major: 'Major character',
  supporting: 'Supporting character',
  minor: 'Minor character',
};

export const ROLE_SIZE: Record<CharacterRole, number> = {
  protagonist: 58,
  major: 44,
  supporting: 34,
  minor: 26,
};

/** Muted, colour-blind-friendlier palette for character groups. */
const GROUP_PALETTE = ['#4f6bd8', '#d4577a', '#2e9c72', '#d08a2c', '#8a5cc9', '#2b9bb0', '#b8543c', '#6f8a2e'];
export const UNGROUPED = '#9a9186';

export function groupColor(groupId: string | undefined, groups: { id: string }[] = []): string {
  if (!groupId) return UNGROUPED;
  const i = groups.findIndex((g) => g.id === groupId);
  return i < 0 ? UNGROUPED : GROUP_PALETTE[i % GROUP_PALETTE.length];
}

export function relColor(type: RelationType, dark: boolean): string {
  return dark ? REL_TYPES[type].dark : REL_TYPES[type].light;
}
