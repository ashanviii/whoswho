/**
 * Inspect automatic extraction on a cached Gutenberg text:
 *   npx tsx scripts/try-extract.ts .cache/gutenberg/1342.txt [--debug Name]
 */
import { readFile } from 'node:fs/promises';
import { extractCharacters } from './lib/extract-characters.ts';

const file = process.argv[2];
const debugName = process.argv.includes('--debug') ? process.argv[process.argv.indexOf('--debug') + 1] : undefined;
const t0 = Date.now();
const r = extractCharacters(await readFile(file, 'utf8'), { debug: debugName });
console.log(`${file}: ${r.sections.length} ${r.sectionKind.plural.toLowerCase()} (fallback=${r.stats.fallbackSections}), ${r.stats.words} words, ${Date.now() - t0} ms`);
console.log('sections:', r.sections.slice(0, 4).map((s) => `${s.label}${s.part ? ` [${s.part}]` : ''}${s.title ? ` "${s.title}"` : ''}`).join(' | '), '…', r.sections.at(-1)?.label);
console.log(`\ncharacters (${r.characters.length}):`);
for (const c of r.characters) console.log(`  ${String(c.mentions).padStart(5)}  ${c.name.padEnd(24)} first ${r.sections[c.firstSection].label.padEnd(8)} aka ${c.aliases.join(', ')}`);
console.log(`\nlinks (${r.links.length}), strongest:`);
const name = (id: string) => r.characters.find((c) => c.id === id)?.name;
for (const l of [...r.links].sort((a, b) => b.weight - a.weight).slice(0, 15)) console.log(`  ${String(l.weight).padStart(4)}  ${name(l.a)} — ${name(l.b)} (from ${r.sections[l.firstSection].label})`);
