/**
 * Scaffold a new character map for an Open Library work.
 *
 *   npm run data:new-map -- OL27448W --sections 22
 *   npm run data:new-map -- OL27448W --scenes 5,4,3,7,5   (acts with N scenes each)
 *
 * Fetches title/author from Open Library, writes data/maps/<id>.json with
 * placeholder sections, and leaves characters/relationships for you to fill
 * in from the text. Nothing about the story is generated.
 */
import { access, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { CharacterMap, Section } from '../src/types/map.ts';
import { politeJson } from './lib/polite-fetch.ts';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const workId = process.argv.slice(2).find((a) => /^OL\d+W$/.test(a));
  if (!workId) {
    console.error('Usage: npm run data:new-map -- OL123W [--sections 30 | --scenes 5,4,3]');
    process.exit(1);
  }
  const file = path.resolve('data/maps', `${workId}.json`);
  try {
    await access(file);
    console.error(`${path.relative(process.cwd(), file)} already exists.`);
    process.exit(1);
  } catch {
    /* good: does not exist */
  }

  const work = await politeJson<{ title: string; authors?: { author: { key: string } }[]; first_publish_date?: string }>(
    `https://openlibrary.org/works/${workId}.json`,
  );
  const authors: string[] = [];
  for (const a of work.authors ?? []) {
    const author = await politeJson<{ name?: string }>(`https://openlibrary.org${a.author.key}.json`);
    if (author.name) authors.push(author.name);
  }

  let sections: Section[];
  let sectionLabel = { singular: 'Chapter', plural: 'Chapters' };
  const scenes = arg('scenes');
  if (scenes) {
    sectionLabel = { singular: 'Scene', plural: 'Scenes' };
    sections = scenes.split(',').flatMap((n, a) =>
      Array.from({ length: Number(n) }, (_, s) => ({ id: `${a + 1}.${s + 1}`, label: `${a + 1}.${s + 1}`, part: `Act ${a + 1}` })),
    );
  } else {
    const n = Number(arg('sections') ?? 20);
    sections = Array.from({ length: n }, (_, i) => ({ id: `c${i + 1}`, label: `Ch. ${i + 1}` }));
  }

  const today = new Date().toISOString().slice(0, 10);
  const map: CharacterMap = {
    schemaVersion: 1,
    workId,
    title: work.title,
    authors: authors.length ? authors : ['Unknown'],
    firstPublished: Number(work.first_publish_date?.match(/\d{4}/)?.[0]) || undefined,
    edition: { description: 'TODO: which edition does the section numbering follow?', source: '', url: '' },
    sectionLabel,
    sections,
    groups: [],
    characters: [],
    relationships: [],
    provenance: {
      method: 'Hand-curated from the text.',
      contributors: [],
      createdAt: today,
      updatedAt: today,
      review: { status: 'unreviewed' },
    },
    license: 'CC BY 4.0',
  };
  await writeFile(file, JSON.stringify(map, null, 2) + '\n');
  console.log(`Created ${path.relative(process.cwd(), file)} for “${work.title}” by ${map.authors.join(', ')}.`);
  console.log('Fill in characters and relationships, then run: npm run data:validate && npm run data:build');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
