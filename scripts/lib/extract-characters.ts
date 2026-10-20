/**
 * Automatic character-network extraction from a plain-text novel.
 *
 * Honest by design: it only reports what can be measured in the text.
 *  - Characters: recurring capitalised names with evidence of being people
 *    (honorifics, speech verbs, first-name lexicon) rather than places.
 *  - Links: two characters are linked when they are named in the same or
 *    adjacent paragraphs. The *kind* of relationship is never guessed.
 *  - Spoiler data comes for free: every character and link is stamped with
 *    the chapter where it first occurs.
 */
import nlp from 'compromise';

export interface ExtractedSection {
  id: string;
  label: string;
  title?: string;
  part?: string;
}

export interface ExtractedCharacter {
  id: string;
  name: string;
  aliases: string[];
  mentions: number;
  firstSection: number;
  firstSentence: string;
  surname?: string;
}

export interface ExtractedLink {
  a: string;
  b: string;
  weight: number;
  firstSection: number;
  /** Shared passages per section index, for spoiler-safe strength over time. */
  perSection: Record<number, number>;
}

export interface Extraction {
  sectionKind: { singular: string; plural: string };
  sections: ExtractedSection[];
  characters: ExtractedCharacter[];
  links: ExtractedLink[];
  stats: { words: number; paragraphs: number; candidates: number; fallbackSections: boolean };
}

const HONORIFICS = [
  'Mr', 'Mrs', 'Miss', 'Ms', 'Mme', 'Mlle', 'Dr', 'Doctor', 'Lady', 'Lord', 'Sir', 'Dame', 'Captain', 'Capt', 'Colonel', 'Col',
  'Major', 'General', 'Lieutenant', 'Sergeant', 'Aunt', 'Uncle', 'Madame', 'Madam', 'Monsieur', 'Mademoiselle', 'Professor', 'Prof',
  'Father', 'Mother', 'Sister', 'Brother', 'Saint', 'St', 'King', 'Queen', 'Prince', 'Princess', 'Count', 'Countess', 'Duke',
  'Duchess', 'Baron', 'Baroness', 'Master', 'Mistress', 'Reverend', 'Rev', 'Inspector', 'Signor', 'Signora', 'Herr', 'Frau',
];
const HON_RE = HONORIFICS.join('|');
const PERSON_VERBS =
  'was|had|looked|went|came|took|felt|knew|could|would|did|smiled|laughed|turned|seemed|made|saw|spoke|thought|stood|sat|left|returned|entered|followed|wished|loved|hated|wept|died|married|herself|himself';
const PERSON_BEFORE = 'dear|poor|little|young|old|saw|met|told|asked|loved|married|with';
const FEMALE_HON = new Set(['Mrs', 'Miss', 'Ms', 'Mme', 'Mlle', 'Lady', 'Dame', 'Madame', 'Madam', 'Mademoiselle', 'Aunt', 'Mother', 'Sister', 'Queen', 'Princess', 'Countess', 'Duchess', 'Baroness', 'Mistress', 'Signora', 'Frau']);
const MALE_HON = new Set(['Mr', 'Sir', 'Lord', 'Uncle', 'Father', 'Brother', 'King', 'Prince', 'Count', 'Duke', 'Baron', 'Master', 'Monsieur', 'Signor', 'Herr']);
function honGender(h: string): 'f' | 'm' | undefined {
  const t = h.replace(/\.$/, '');
  return FEMALE_HON.has(t) ? 'f' : MALE_HON.has(t) ? 'm' : undefined;
}
const SPEECH = 'said|says|replied|cried|asked|answered|exclaimed|returned|continued|observed|added|whispered|shouted|muttered|thought|told|began|repeated|resumed|interrupted|rejoined|remarked';

// Capitalised words that are almost never character names.
const STOP = new Set(
  (
    'I Me My We Our You Your He Him His She Her It Its They Them Their The A An And But Or If Then When Where What Why How Who ' +
    'Whom Whose Which This That These Those There Here Yes No Not Oh Ah Alas Well Now So Yet Still Perhaps Indeed Nay Aye Pray ' +
    'Do Does Did Is Was Were Be Been Am Are Have Has Had Will Would Shall Should Can Could May Might Must Let Come Go See Look ' +
    'All Some Any Every Each Both Either Neither None Nothing Everything Something Anything One Two Three Four Five Six Seven Eight ' +
    'Nine Ten First Second Third Last Next Many Much More Most Such Very Only Even Just Upon After Before Again Though Although ' +
    'While As At By For From In Into Of On Off Out Over To Under Up With Without About Above Across Against Among Around Behind ' +
    'Below Beside Between Beyond During Except Inside Near Since Through Till Toward Towards Until Within Ever Never Always ' +
    'Monday Tuesday Wednesday Thursday Friday Saturday Sunday January February March April June July August September October ' +
    'November December Christmas Easter God Lord Heaven Heavens Hell Christ Jesus Providence Bible Chapter Book Part Volume ' +
    'English French German Italian Spanish Russian Scotch Irish American Indian British Roman Greek Latin Christian Mrs Mr Miss ' +
    'Sir Madam Dear Good Poor Old Young Little Great Mind Thank Thanks Hush Hark Pshaw Bah Fie Hurrah Goodbye Good-bye Gutenberg ' +
    'Project Ebook EBook Illustration Contents Preface Introduction Note Footnote Finis End Street Square Hall House Park Road ' +
    'Lane Court Abbey Castle Church Inn River Hill Bridge Town City Island Sea North South East West Majesty Highness Excellency ' +
    'Diary Journal Telegram Memorandum Phonograph Postscript Letter Letters Log Notes Puritan Puritans Satan Devil Pope Quaker Surveyor Collector Custom Custom-House Providence Fate Fortune Nature Death Time Love ' +
    'Arabian Arab Turk Turkish Moor Persian Egyptian Swiss Dutch Swede Swedish Dane Danish Norwegian Polish Austrian Prussian Hungarian Chinese Japanese African Asian European Saxon Norman Celtic Welsh Highland Lowland Parisian Londoner ' +
    'Honour Honor Ladyship Lordship Grace Reverence Sire Papa Mamma Mama Mother Father Uncle Aunt Captain Doctor Professor'
  ).split(/\s+/),
);

const ROMAN: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 };
function romanToInt(s: string): number | undefined {
  const t = s.toLowerCase();
  if (!/^[ivxlcdm]+$/.test(t)) return undefined;
  let total = 0;
  for (let i = 0; i < t.length; i++) {
    const v = ROMAN[t[i]];
    const next = ROMAN[t[i + 1]] ?? 0;
    total += v < next ? -v : v;
  }
  return total;
}
const WORD_NUM = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
/** "12", "XII", "twelve", "twenty-one", "Forty Two" → number. */
export function headingNumber(token: string): number | undefined {
  if (/^\d+$/.test(token)) return Number(token);
  const r = romanToInt(token);
  if (r) return r;
  const parts = token.toLowerCase().split(/[-\s]+/);
  const tens = TENS.indexOf(parts[0]);
  if (tens >= 2) {
    const unit = parts[1] ? WORD_NUM.indexOf(parts[1]) : 0;
    return parts.length <= 2 && unit >= 0 && unit < 10 ? tens * 10 + unit : undefined;
  }
  const w = WORD_NUM.indexOf(parts[0]);
  return w > 0 && parts.length === 1 ? w : undefined;
}

/** Remove [Illustration: …], [Footnote: …] and similar blocks, including nested brackets. */
export function stripBracketBlocks(text: string): string {
  const open = /\[(?:Illustration|Footnote|Sidenote|Transcriber|_?Copyright)/gi;
  let out = '';
  let pos = 0;
  let m: RegExpExecArray | null;
  while ((m = open.exec(text))) {
    if (m.index < pos) continue;
    out += text.slice(pos, m.index);
    let depth = 0;
    let i = m.index;
    for (; i < text.length; i++) {
      if (text[i] === '[') depth++;
      else if (text[i] === ']' && --depth === 0) break;
    }
    const removed = text.slice(m.index, i + 1);
    const headings = removed.split('\n').filter((ln) => HEADING_RE.test(ln.replace(/[[\]_]/g, '').trim()));
    if (headings.length) out += '\n\n' + headings.map((h) => h.replace(/[[\]_]/g, '').trim()).join('\n\n') + '\n\n';
    pos = i + 1;
    open.lastIndex = pos;
  }
  return out + text.slice(pos);
}

/** Remove the Project Gutenberg licence header and footer. */
export function stripGutenberg(text: string): string {
  const t = text.replace(/\r\n?/g, '\n');
  const start = t.search(/\*\*\*\s*START OF (THE|THIS) PROJECT GUTENBERG[^\n]*\n/i);
  const end = t.search(/\*\*\*\s*END OF (THE|THIS) PROJECT GUTENBERG/i);
  let body = t.slice(start >= 0 ? t.indexOf('\n', start) + 1 : 0, end >= 0 ? end : undefined);
  // Drop transcriber / producer notes at the very top.
  body = body.replace(/^[\s\S]{0,2000}?(Produced by|Transcribed by|E-text prepared by)[^\n]*\n(?:[^\n]+\n)*/i, '');
  return body;
}

const SECTION_KEYWORDS = ['chapter', 'stave', 'letter', 'book', 'part', 'canto'];
const HEADING_RE = new RegExp(String.raw`^\s*(chapter|stave|letter|book|part|canto)\s+([0-9]+|[ivxlcdm]+|[a-z]+(?:-[a-z]+)?)\b[.:]?\s*(.*)$`, 'i');
const PART_RE = /^\s*(book|volume|part)\s+([0-9]+|[ivxlcdm]+|[a-z]+)\b[.:]?\s*(.*)$/i;
/** Bare numbered headings: "I. THE PRISON-DOOR", "XII." (upper-case title or nothing). */
const ROMAN_HEADING_RE = /^\s*([IVXLC]+|\d+)\.\s*([A-Z0-9][A-Z0-9 ,.'’:;!?&-]*)?$/;
/** A number alone on its line, between blank lines ("1" then a title line) — common in Gutenberg texts. */
const BARE_NUMBER_RE = /^\s*(\d{1,3}|[IVXLC]{1,7})\s*$/;

interface RawSection {
  label: string;
  title?: string;
  part?: string;
  paragraphs: string[];
}

/** Split a novel body into chapters (falls back to equal parts). */
export function splitSections(body: string): { kind: { singular: string; plural: string }; sections: RawSection[]; fallback: boolean } {
  const lines = body.split('\n');
  type Hit = { line: number; kw: string; num?: number; rest: string };
  const hits: Hit[] = [];
  lines.forEach((ln, i) => {
    if (ln.length > 90) return;
    const roman = ROMAN_HEADING_RE.exec(ln);
    const bare = BARE_NUMBER_RE.exec(ln);
    // Either a blank line follows, or a short title line ("I" / "The Old Sea-dog…") and then a blank line.
    const next = lines[i + 1]?.trim() ?? '';
    const nextBlank =
      i + 1 >= lines.length || next === '' || (next.length < 70 && !/[.,;]$/.test(next) && /^[A-Z]/.test(next) && (lines[i + 2] ?? '').trim() === '');
    const m =
      HEADING_RE.exec(ln) ??
      (roman ? ([ln, 'chapter', roman[1], roman[2] ?? ''] as unknown as RegExpExecArray) : null) ??
      (bare && nextBlank ? ([ln, 'chapter', bare[1], ''] as unknown as RegExpExecArray) : null);
    if (!m) return;
    const num = headingNumber(m[2]);
    if (num === undefined) return;
    const prevBlank = i === 0 || lines[i - 1].trim() === '';
    if (!prevBlank) return;
    hits.push({ line: i, kw: m[1].toLowerCase(), num, rest: m[3].trim() });
  });

  // Choose the keyword that best represents the book's units.
  const counts = new Map<string, number>();
  for (const h of hits) counts.set(h.kw, (counts.get(h.kw) ?? 0) + 1);
  const kw = SECTION_KEYWORDS.filter((k) => (counts.get(k) ?? 0) >= 3).sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0))[0];
  // Epistolary openings ("Letter 1–4" before "Chapter 1") count as sections too.
  const unitKinds = new Set([kw]);
  if (kw === 'chapter' && (counts.get('letter') ?? 0) >= 1) unitKinds.add('letter');

  const toParas = (from: number, to: number) =>
    lines
      .slice(from, to)
      .join('\n')
      .split(/\n\s*\n/)
      .map((p) =>
        p
          .replace(/\[(?:Illustration|Footnote|Sidenote)[^\]]*\]/gi, ' ')
          .replace(/\s+/g, ' ')
          .trim(),
      )
      .filter((p) => p.length > 0 && !/^\[(?:Illustration|Footnote)/i.test(p));

  if (kw) {
    let units = hits.filter((h) => unitKinds.has(h.kw));
    // Drop table-of-contents entries: headings with almost nothing before the next one.
    const lenAfter = (i: number) => {
      const end = i + 1 < units.length ? units[i + 1].line : lines.length;
      return lines.slice(units[i].line + 1, end).join('\n').length;
    };
    units = units.filter((_, i) => lenAfter(i) > 1200);
    if (units.length >= 3) {
      // Track enclosing parts/books/volumes when the unit is a chapter.
      const partHeads: { line: number; label: string }[] = [];
      if (kw === 'chapter' || kw === 'letter' || kw === 'stave') {
        lines.forEach((ln, i) => {
          const m = PART_RE.exec(ln);
          if (m && ln.length < 60 && headingNumber(m[2]) !== undefined && (i === 0 || lines[i - 1].trim() === '')) {
            partHeads.push({ line: i, label: `${m[1][0].toUpperCase()}${m[1].slice(1).toLowerCase()} ${m[2].toUpperCase()}` });
          }
        });
      }
      const singular = kw === 'stave' ? 'Stave' : kw === 'letter' ? 'Letter' : kw === 'canto' ? 'Canto' : kw === 'book' ? 'Book' : kw === 'part' ? 'Part' : 'Chapter';
      const shortFor = (k: string) => (k === 'chapter' ? 'Ch.' : k[0].toUpperCase() + k.slice(1));
      const sections = units.map((u, i) => {
        const end = i + 1 < units.length ? units[i + 1].line : lines.length;
        const part = [...partHeads].reverse().find((p) => p.line < u.line)?.label;
        let title = u.rest.replace(/^[-–—.:\s]+/, '').trim();
        if (!title) {
          const next = lines.slice(u.line + 1, u.line + 4).find((l) => l.trim());
          if (next && next.trim().length < 70 && !/[.!?,;]$/.test(next.trim())) title = next.trim();
        }
        return {
          label: `${shortFor(u.kw)} ${u.num}`,
          title: title && title.length < 70 && !/^\W*$/.test(title) ? title : undefined,
          part,
          paragraphs: toParas(u.line + 1, end),
        };
      });
      // Text before the first unit (editors' prefaces, contents, illustrations) is ignored:
      // prefaces often discuss the characters and would leak spoilers into chapter 1.
      return { kind: { singular, plural: `${singular}s` }, sections, fallback: false };
    }
  }

  // Fallback: ~12 equal parts so the spoiler shield still works.
  const paras = toParas(0, lines.length);
  const n = Math.min(12, Math.max(3, Math.round(paras.length / 40)));
  const size = Math.ceil(paras.length / n);
  const sections = Array.from({ length: n }, (_, i) => ({
    label: `Part ${i + 1}`,
    title: `about ${Math.round(((i + 1) / n) * 100)}% through`,
    paragraphs: paras.slice(i * size, (i + 1) * size),
  })).filter((s) => s.paragraphs.length);
  return { kind: { singular: 'Part', plural: 'Parts' }, sections, fallback: true };
}

interface Mention {
  key: string;
  section: number;
  para: number;
  mid: boolean;
  sentence: string;
}

const NAME_RE = new RegExp(
  String.raw`(?:\b(${HON_RE})\.?\s+)?\b([A-Z][a-z]+(?:['’][a-z]+)?(?:[-\s](?:de\s|van\s|von\s|du\s|le\s|la\s|di\s|da\s)?[A-Z][a-z]+(?:['’][a-z]+)?)?)\b`,
  'g',
);

function sentenceAround(text: string, index: number): string {
  const start = Math.max(text.lastIndexOf('. ', index), text.lastIndexOf('! ', index), text.lastIndexOf('? ', index));
  const s = text.slice(start < 0 ? 0 : start + 2);
  const endMatch = /[.!?](?=["”’']?\s|$)/.exec(s.slice(index - (start < 0 ? 0 : start + 2)));
  const end = endMatch ? index - (start < 0 ? 0 : start + 2) + endMatch.index + 1 : s.length;
  return s.slice(0, end).trim();
}

export function extractCharacters(text: string, opts: { maxCharacters?: number; debug?: string } = {}): Extraction {
  const maxCharacters = opts.maxCharacters ?? 32;
  const body = stripBracketBlocks(stripGutenberg(text));
  const { kind, sections, fallback } = splitSections(body);
  const allParas = sections.flatMap((s, si) => s.paragraphs.map((p) => ({ si, p })));
  const words = allParas.reduce((n, x) => n + x.p.split(' ').length, 0);
  const minMentions = Math.max(5, Math.round(words / 25000));

  // 1. Collect capitalised-name mentions.
  const mentions: (Mention & { index: number })[] = [];
  const lowerCounts = new Map<string, number>();
  for (const { p } of allParas) for (const w of p.match(/\b[a-z]{3,}\b/g) ?? []) lowerCounts.set(w, (lowerCounts.get(w) ?? 0) + 1);
  allParas.forEach(({ si, p }, pi) => {
    NAME_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = NAME_RE.exec(p))) {
      const hon = m[1];
      if (hon && isHon(m[2].split(' ')[0])) {
        NAME_RE.lastIndex = m.index + m[0].indexOf(m[2]);
        continue;
      }
      let name = m[2].replace(/['’]s$/, '');
      // Trim trailing stop-words captured as a second token ("Darcy The").
      const parts = name.split(/[-\s]+/);
      if (parts.length > 1 && STOP.has(parts[parts.length - 1])) name = parts.slice(0, -1).join(' ');
      if (STOP.has(name.split(/[-\s]/)[0]) && !hon) continue;
      if (name.length < 2) continue;
      const before = p.slice(0, m.index).trimEnd();
      let sentenceStart = before === '' || /[.!?]["”’']?$|["“‘']$|[:;—]$/.test(before);
      const words = name.split(' ');
      if (!hon && sentenceStart && words.length === 2 && (lowerCounts.get(words[0].toLowerCase()) ?? 0) >= 3) {
        name = words[1];
        sentenceStart = false;
      }
      const key = hon ? `${normaliseHon(hon)} ${name}` : name;
      mentions.push({ key, section: si, para: pi, mid: hon ? true : !sentenceStart, sentence: '', index: m.index });
    }
  });

  // 2. Score candidates with simple, explainable evidence.
  interface Cand {
    key: string;
    count: number;
    mid: number;
    hon: boolean;
    speech: number;
    place: number;
    person: number;
    first: number; // first section index
  }
  const cands = new Map<string, Cand>();
  for (const m of mentions) {
    const first = m.key.split(' ')[0];
    const c = cands.get(m.key) ?? { key: m.key, count: 0, mid: 0, hon: m.key.includes(' ') && isHon(first), speech: 0, place: 0, person: 0, first: m.section };
    c.count++;
    if (m.mid) c.mid++;
    cands.set(m.key, c);
  }
  const fullText = allParas.map((x) => x.p).join('\n');
  const frequent = [...cands.values()].filter((c) => c.count >= minMentions);
  for (const c of frequent) {
    const esc = c.key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\.?\\s+');
    const count = (re: string) => (fullText.match(new RegExp(re, 'g')) ?? []).length;
    c.speech = count(`\\b(?:${SPEECH})\\s+${esc}\\b|\\b${esc},?\\s+(?:${SPEECH})\\b`);
    c.place = count(`\\b(?:in|at|to|from|into|near|towards|toward|through|across|reached|left)\\s+${esc}\\b`);
    c.person = count(`\\b${esc}(?:['’]s\\b|\\s+(?:${PERSON_VERBS})\\b)|\\b(?:${PERSON_BEFORE})\\s+${esc}\\b`);
  }

  const firstNameLexicon = (name: string) => nlp(name).has('#FirstName');
  const accepted = frequent.filter((c) => {
    if (c.hon) return true;
    const first = c.key.split(/[-\s]/)[0];
    if (STOP.has(first)) return false;
    if ((lowerCounts.get(first.toLowerCase()) ?? 0) > c.count * 0.25) return false; // common noun ("Hope", "Nature")
    const placeRate = c.place / c.count;
    const personRate = (c.person + c.speech * 2) / c.count;
    const strongPerson = c.speech >= 2 || (firstNameLexicon(first) && personRate >= 0.1);
    // Known place names ("Boston") are rejected unless the text clearly treats them as a person ("said Wickham").
    if (!strongPerson && nlp(c.key).has('(#Place|#Country|#City|#Region)')) return false;
    if (c.mid / c.count < (strongPerson ? 0.15 : 0.4)) return false; // mostly sentence-initial → not a name
    if (placeRate > 0.3 && personRate < placeRate) return false; // "in London", "to Meryton"
    return personRate >= 0.12 || c.speech >= 2 || (firstNameLexicon(first) && placeRate < 0.15);
  });

  // 3. Resolve aliases into entities (conservatively: ambiguity → leave separate or drop).
  const acceptedKeys = new Set(accepted.map((c) => c.key));
  // Plurals of a known surname ("the Cratchits") are families, not people.
  const surnames = new Set(accepted.filter((c) => c.key.includes(' ')).map((c) => c.key.split(' ').slice(-1)[0]));
  for (const c of [...accepted]) {
    if (!c.key.includes(' ') && /s$/.test(c.key) && (surnames.has(c.key.slice(0, -1)) || acceptedKeys.has(c.key.slice(0, -1)))) {
      accepted.splice(accepted.indexOf(c), 1);
    }
  }
  // Rarer "First Last" forms whose parts are both known names link the two ("Victor" + "Frankenstein").
  const bridges = [...cands.values()].filter((c) => {
    if (c.hon || acceptedKeys.has(c.key) || c.count < 2) return false;
    const parts = c.key.split(' ');
    return parts.length === 2 && acceptedKeys.has(parts[0]) && acceptedKeys.has(parts[1]);
  });
  const byKey = new Map([...accepted, ...bridges].map((c) => [c.key, c]));
  const multi = [...accepted.filter((c) => !c.hon && c.key.includes(' ')), ...bridges];
  const titled = accepted.filter((c) => c.hon);
  const lastOf = (k: string) => k.split(' ').slice(-1)[0];
  const firstOf = (k: string) => k.split(' ')[0];
  const alias = new Map<string, string>(); // key -> canonical key
  for (const c of [...accepted, ...bridges]) alias.set(c.key, c.key);
  // Never merge a name into someone introduced later: it is probably a different person.
  const canMerge = (from: Cand, to: Cand) => from.first >= to.first;

  for (const c of accepted.filter((x) => !x.hon && !x.key.includes(' '))) {
    const asFirst = multi.filter((m) => firstOf(m.key) === c.key);
    const lastMulti = multi.filter((m) => lastOf(m.key) === c.key);
    // "Mr. Edgar" uses a first name, so it says nothing about "Edgar" being a surname.
    const lastTitled = titled.filter((t) => lastOf(t.key) === c.key && !(asFirst.length > 0 && t.key.split(' ').length === 2));
    const lastTotal = [...lastMulti, ...lastTitled].reduce((n, x) => n + x.count, 0);

    if (asFirst.length === 1 && lastTotal === 0) {
      if (canMerge(c, asFirst[0])) alias.set(c.key, asFirst[0].key);
    } else if (asFirst.length === 0 && lastTotal > 0) {
      const genders = new Set(lastTitled.map((t) => honGender(firstOf(t.key))).filter(Boolean));
      if (c.count >= 2 * lastTotal && lastMulti.length <= 1 && genders.size <= 1) {
        // The bare surname dominates ("Scrooge"): it is the character; fold compatible variants in.
        const target = lastMulti[0] ?? c;
        const targetFirst = lastMulti[0] ? firstOf(lastMulti[0].key) : undefined;
        const targetG = targetFirst ? (nlp(targetFirst).has('#FemaleName') ? 'f' : nlp(targetFirst).has('#MaleName') ? 'm' : undefined) : undefined;
        alias.set(c.key, target.key);
        for (const v of lastTitled) {
          const g = honGender(firstOf(v.key));
          // A bare surname conventionally means the man; female titles stay separate unless the full name is female.
          if (g === 'f' && targetG !== 'f') continue;
          if (g && targetG && g !== targetG) continue;
          alias.set(v.key, target.key);
        }
      } else {
        const top = [...lastMulti, ...lastTitled].sort((a, b) => b.count - a.count)[0];
        if (top.count / lastTotal >= 0.75 && canMerge(c, top)) alias.set(c.key, top.key);
        else alias.delete(c.key); // ambiguous surname ("Bennet") — ignore bare uses
      }
    } else if (asFirst.length > 1) {
      alias.delete(c.key);
    }
  }
  const genderOfName = (n: string) => (nlp(n).has('#FemaleName') ? 'f' : nlp(n).has('#MaleName') ? 'm' : undefined);
  const compatible = (hon: string, fullKey: string) => {
    const g = honGender(hon);
    const ng = genderOfName(firstOf(fullKey));
    return !(g === 'f' && ng !== 'f' && ng !== undefined) && !(g === 'm' && ng === 'f');
  };
  for (const t of titled) {
    const [hon, ...rest] = t.key.split(' ');
    const nameOnly = rest.join(' ');
    // "Mr. Dorian Gray" → "Dorian Gray".
    const exact = multi.find((m) => m.key === nameOnly);
    if (exact && compatible(hon, exact.key)) {
      alias.set(t.key, exact.key);
      continue;
    }
    // "Lord Henry" → "Lord Henry Wotton" (unique longer titled form).
    const longer = titled.filter((x) => x !== t && x.key.startsWith(t.key + ' '));
    if (longer.length === 1) {
      alias.set(t.key, longer[0].key);
      continue;
    }
    // "Mr. Edgar" → "Edgar Linton" (first name of exactly one full name).
    if (rest.length === 1) {
      const byFirst = multi.filter((m) => firstOf(m.key) === rest[0]);
      if (byFirst.length === 1 && compatible(hon, byFirst[0].key) && canMerge(t, byFirst[0])) alias.set(t.key, byFirst[0].key);
    }
  }
  // "Mr. Holmes" → "Sherlock Holmes" when the surname is unique and genders agree.
  for (const t of titled) {
    if (alias.get(t.key) !== t.key) continue;
    const last = lastOf(t.key);
    const fulls = multi.filter((m) => lastOf(m.key) === last);
    // Titled forms already resolved elsewhere ("Mr. Dorian Gray") don't make the surname ambiguous.
    const otherTitles = titled.filter((x) => x !== t && lastOf(x.key) === last && alias.get(x.key) === x.key);
    if (fulls.length !== 1 || otherTitles.length !== 0) continue;
    const g = honGender(firstOf(t.key));
    const nameG = nlp(firstOf(fulls[0].key)).has('#FemaleName') ? 'f' : nlp(firstOf(fulls[0].key)).has('#MaleName') ? 'm' : undefined;
    if (g === 'f' && nameG !== 'f') continue;
    if (g === 'm' && nameG === 'f') continue;
    if (canMerge(t, fulls[0])) alias.set(t.key, fulls[0].key);
  }
  if (opts.debug) {
    for (const c of [...cands.values()].filter((x) => x.key.includes(opts.debug!))) {
      console.error('[debug]', JSON.stringify({ ...c, accepted: accepted.includes(c), bridge: bridges.includes(c), alias: alias.get(c.key) ?? '(dropped)' }));
    }
  }
  // Follow chains.
  const canon = (k: string): string | undefined => {
    let cur = alias.get(k);
    for (let i = 0; cur && i < 5 && alias.get(cur) !== cur; i++) cur = alias.get(cur);
    return cur;
  };

  // 4. Aggregate entities.
  interface Ent {
    key: string;
    names: Map<string, number>;
    mentions: number;
    first: Mention & { index: number };
  }
  const ents = new Map<string, Ent>();
  const paraEnts = new Map<number, Set<string>>();
  for (const m of mentions) {
    const k = canon(m.key);
    if (!k || !byKey.has(k)) continue;
    const e = ents.get(k) ?? { key: k, names: new Map(), mentions: 0, first: m };
    e.mentions++;
    e.names.set(m.key, (e.names.get(m.key) ?? 0) + 1);
    ents.set(k, e);
    if (!paraEnts.has(m.para)) paraEnts.set(m.para, new Set());
    paraEnts.get(m.para)!.add(k);
  }
  const top = [...ents.values()].filter((e) => e.mentions >= minMentions).sort((a, b) => b.mentions - a.mentions).slice(0, maxCharacters);
  const kept = new Set(top.map((e) => e.key));

  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'c';
  const ids = new Map<string, string>();
  const characters: ExtractedCharacter[] = top.map((e) => {
    let id = slug(e.key);
    while ([...ids.values()].includes(id)) id += '-2';
    ids.set(e.key, id);
    const para = allParas[e.first.para].p;
    const sentence = sentenceAround(para, e.first.index);
    const display = displayName(e);
    const parts = display.split(' ');
    return {
      id,
      name: display,
      aliases: [...e.names.keys()].filter((n) => n !== display).sort((a, b) => (e.names.get(b) ?? 0) - (e.names.get(a) ?? 0)).slice(0, 4),
      mentions: e.mentions,
      firstSection: e.first.section,
      firstSentence: sentence.length > 220 ? `${sentence.slice(0, 217).trimEnd()}…` : sentence,
      surname: parts.length > 1 ? parts[parts.length - 1] : undefined,
    };
  });

  // 5. Co-occurrence in the same or adjacent paragraph.
  const pairs = new Map<string, ExtractedLink>();
  const paraIdx = [...paraEnts.keys()].sort((a, b) => a - b);
  for (const pi of paraIdx) {
    const here = [...(paraEnts.get(pi) ?? [])].filter((k) => kept.has(k));
    const next = [...(paraEnts.get(pi + 1) ?? [])].filter((k) => kept.has(k));
    const window = new Set([...here, ...next]);
    const list = [...window];
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const [a, b] = [ids.get(list[i])!, ids.get(list[j])!].sort();
        const key = `${a}|${b}`;
        const link = pairs.get(key) ?? { a, b, weight: 0, firstSection: allParas[pi].si, perSection: {} };
        link.weight++;
        link.perSection[allParas[pi].si] = (link.perSection[allParas[pi].si] ?? 0) + 1;
        pairs.set(key, link);
      }
    }
  }
  // Keep meaningful links: each character's strongest ties plus anything clearly strong.
  const all = [...pairs.values()].filter((l) => l.weight >= 3);
  const strongest = new Set<string>();
  for (const c of characters) {
    all
      .filter((l) => l.a === c.id || l.b === c.id)
      .sort((x, y) => y.weight - x.weight)
      .slice(0, 5)
      .forEach((l) => strongest.add(`${l.a}|${l.b}`));
  }
  const threshold = Math.max(8, quantile(all.map((l) => l.weight), 0.8));
  const links = all.filter((l) => strongest.has(`${l.a}|${l.b}`) || l.weight >= threshold);

  return {
    sectionKind: kind,
    sections: sections.map((s, i) => ({ id: `s${i + 1}`, label: s.label, ...(s.title ? { title: s.title } : {}), ...(s.part ? { part: s.part } : {}) })),
    characters,
    links,
    stats: { words, paragraphs: allParas.length, candidates: accepted.length, fallbackSections: fallback },
  };
}

function isHon(w: string) {
  return HONORIFICS.includes(w.replace(/\.$/, ''));
}
function normaliseHon(h: string) {
  const map: Record<string, string> = { Mr: 'Mr.', Mrs: 'Mrs.', Ms: 'Ms.', Dr: 'Dr.', St: 'St.', Capt: 'Captain', Col: 'Colonel', Prof: 'Professor', Rev: 'Reverend', Mme: 'Mme.', Mlle: 'Mlle.' };
  return map[h] ?? h;
}
function displayName(e: { key: string; names: Map<string, number> }) {
  // Prefer the full "First Last" form, else the most frequent form.
  if (e.key.includes(' ') && !isHon(e.key.split(' ')[0])) return e.key;
  return [...e.names.entries()].sort((a, b) => b[1] - a[1])[0][0];
}
function quantile(xs: number[], q: number) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
}
