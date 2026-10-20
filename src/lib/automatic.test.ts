import { describe, expect, it } from 'vitest';
import { extractCharacters, headingNumber, stripBracketBlocks } from '../../scripts/lib/extract-characters.ts';
import { validateMap } from '../../scripts/lib/validate-map.ts';
import type { BookMeta } from '../types/catalog.ts';
import { buildView } from './spoilers.ts';
import { buildMap, resolveExtracts, tidyExtract } from './wikidata.ts';

const book: BookMeta = { id: 'OL1W', title: 'Test Book', authors: ['A. Writer'], genres: [], mapped: false, inCatalog: true };
const v = (value: string) => ({ value });
const wd = (q: string) => v(`http://www.wikidata.org/entity/${q}`);
const prop = (p: string) => v(`http://www.wikidata.org/prop/direct/${p}`);

describe('Wikidata import', () => {
  const rows = [
    { c: wd('Q1'), cLabel: v('Anna'), cDescription: v('heroine'), p: prop('P22'), o: wd('Q2') },
    { c: wd('Q2'), cLabel: v('Boris'), cDescription: undefined, p: prop('P40'), o: wd('Q1') },
    { c: wd('Q1'), cLabel: v('Anna'), cDescription: v('heroine'), p: prop('P26'), o: wd('Q3') },
    { c: wd('Q3'), cLabel: v('Carl'), cDescription: undefined, p: prop('P7047'), o: wd('Q2') },
    { c: wd('Q4'), cLabel: v('Q4'), cDescription: undefined, p: undefined, o: undefined },
    { c: wd('Q3'), cLabel: v('Carl'), cDescription: undefined, p: prop('P1038'), o: wd('Q5'), kindLabel: v('uncle') },
    { c: wd('Q5'), cLabel: v('Dora'), cDescription: undefined, p: undefined, o: undefined },
  ];

  it('builds a valid, typed map and keeps the most specific statement per pair', () => {
    const map = buildMap(book, 'Q99', rows)!;
    expect(map).not.toBeNull();
    expect(validateMap(map, 'OL1W.json').errors).toEqual([]);
    expect(map.provenance.kind).toBe('wikidata');
    const annaBoris = map.relationships.find((r) => [r.source, r.target].sort().join() === 'Q1,Q2')!;
    expect(annaBoris.phases[0].label).toBe('Father & child'); // P22 outranks P40
    expect(annaBoris.phases[0].targetRole).toBe('Father');
    expect(map.characters.map((c) => c.id)).not.toContain('Q4'); // unlabelled, unlinked
    const uncle = map.relationships.find((r) => r.target === 'Q5')!;
    expect(uncle.phases[0].label).toBe('Uncle'); // kinship qualifier beats the vague "relative"
    expect(uncle.phases[0].targetRole).toBe('Uncle');
  });

  it('returns null when there is too little to draw', () => {
    expect(buildMap(book, 'Q99', rows.slice(0, 2))).toBeNull();
  });
});

describe('automatic extraction', () => {
  const para = (s: string) => s + '\n\n';
  const chapter = (n: string, body: string) => `\n\nCHAPTER ${n}.\n\n${body}${'Filler sentence about the weather and the long road home. '.repeat(30)}\n\n`;
  const text =
    '*** START OF THE PROJECT GUTENBERG EBOOK TEST ***\n' +
    para('PREFACE. In this novel Mr. Spoiler dies.') +
    chapter('I', para('Mary Smith walked out. “Hello,” said Mary. Mary smiled at Tom.').repeat(4) + para('Tom Green answered her. “Good day,” said Tom.').repeat(4)) +
    chapter('II', para('Mary and Tom went to see Mr. Brown. Mr. Brown was old.').repeat(6)) +
    chapter('III', para('Later Mary spoke to Mr. Brown again, and Tom laughed.').repeat(6)) +
    '*** END OF THE PROJECT GUTENBERG EBOOK TEST ***';

  const x = extractCharacters(text);

  it('splits chapters and ignores prefaces', () => {
    expect(x.sections.map((s) => s.label)).toEqual(['Ch. 1', 'Ch. 2', 'Ch. 3']);
    expect(x.characters.map((c) => c.name).join()).not.toContain('Spoiler');
  });

  it('merges first names into full names and stamps first appearances', () => {
    const mary = x.characters.find((c) => c.name.startsWith('Mary'))!;
    expect(mary).toBeTruthy();
    expect(mary.firstSection).toBe(0);
    const brown = x.characters.find((c) => c.name === 'Mr. Brown')!;
    expect(brown.firstSection).toBe(1);
  });

  it('links characters named together', () => {
    const names = (id: string) => x.characters.find((c) => c.id === id)!.name;
    const pairs = x.links.map((l) => [names(l.a), names(l.b)].map((n) => n.split(' ')[0]).sort().join(' + '));
    expect(pairs).toContain('Mary + Tom');
  });

  it('reads chapter numbers in any common form', () => {
    expect(['12', 'XII', 'twelve', 'TWENTY-ONE', 'Forty-Seven', 'thirty'].map(headingNumber)).toEqual([12, 12, 12, 21, 47, 30]);
    expect(headingNumber('Prologue')).toBeUndefined();
  });

  it('removes nested illustration captions', () => {
    expect(stripBracketBlocks('a [Illustration: x [_Copyright 1894_]] b').replace(/\s+/g, ' ')).toBe('a b');
  });
});

describe('spoiler-safe link strength', () => {
  it('only shows the strength reached so far', () => {
    const map = buildMap(book, 'Q99', [
      { c: wd('Q1'), cLabel: v('Anna'), cDescription: undefined, p: prop('P3373'), o: wd('Q2') },
      { c: wd('Q2'), cLabel: v('Boris'), cDescription: undefined, p: prop('P3373'), o: wd('Q3') },
      { c: wd('Q3'), cLabel: v('Carl'), cDescription: undefined, p: prop('P3373'), o: wd('Q1') },
    ])!;
    // Wikidata maps have a single section, so everything is visible at once.
    expect(buildView(map, 0).relationships).toHaveLength(3);
  });
});

describe('Wikipedia descriptions', () => {
  const query = {
    normalized: [{ from: 'harry Potter (character)', to: 'Harry Potter (character)' }],
    redirects: [
      { from: 'Dudley Dursley', to: 'List of Harry Potter characters', tofragment: 'Dudley Dursley' },
      { from: 'Hermione', to: 'Hermione Granger' },
    ],
    pages: [
      { title: 'Harry Potter (character)', extract: 'Harry Potter is a fictional character and the protagonist of the series.' },
      { title: 'Hermione Granger', extract: 'Hermione Granger is a fictional character in the Harry Potter series.' },
      { title: 'List of Harry Potter characters', extract: 'This is a list of notable characters.' },
      { title: 'Empty Page', extract: '' },
    ],
  };
  const out = resolveExtracts(['harry Potter (character)', 'Dudley Dursley', 'Hermione', 'Empty Page'], query, 'Some Book');

  it('follows normalisation and redirects', () => {
    expect(out.get('harry Potter (character)')?.title).toBe('Harry Potter (character)');
    expect(out.get('Hermione')?.text).toMatch(/^Hermione Granger is/);
  });
  it('skips redirects into list sections and empty pages', () => {
    expect(out.has('Dudley Dursley')).toBe(false);
    expect(out.has('Empty Page')).toBe(false);
  });
  it('keeps descriptions short and drops the first parenthetical', () => {
    expect(tidyExtract('Ann Smith (born 1900) is a farmer.')).toBe('Ann Smith is a farmer.');
    expect(tidyExtract(`${'Long sentence here. '.repeat(30)}`).length).toBeLessThanOrEqual(321);
  });
});
