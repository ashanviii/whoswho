import type { CharacterMap, Section } from '../types/map';

/** Long, human-friendly name for a section: "Chapter 12", "Act 3, Scene 1". */
export function sectionName(s: Section | undefined): string {
  if (!s) return '';
  const ch = /^Ch\. (\d+)$/.exec(s.label);
  if (ch) return `Chapter ${ch[1]}`;
  const sc = /^(\d+)\.(\d+)$/.exec(s.label);
  if (sc) return `Act ${sc[1]}, Scene ${sc[2]}`;
  return s.label;
}

export function sectionById(map: CharacterMap, id: string): Section | undefined {
  return map.sections.find((s) => s.id === id);
}
