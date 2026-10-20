import { useEffect, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { ReviewBadge } from '../components/Badges';
import { MapMarker } from '../components/BookCard';
import { REL_TYPES } from '../lib/relTypes';
import { useIsDark } from '../lib/theme';
import { RELATION_TYPES } from '../types/map';

function Section({ id, title, children }: { id?: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20">
      <h2 className="mb-3 font-serif text-2xl font-semibold tracking-tight">{title}</h2>
      <div className="space-y-3 leading-relaxed text-muted-foreground [&_strong]:text-foreground">{children}</div>
    </section>
  );
}

export function About() {
  const dark = useIsDark();
  const { hash } = useLocation();
  useEffect(() => {
    document.title = 'About — Character Chart';
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView();
  }, [hash]);

  return (
    <div className="mx-auto max-w-2xl space-y-12 px-4 py-12 sm:px-6 sm:py-16">
      <header>
        <h1 className="font-serif text-4xl font-semibold tracking-tight">About Character Chart</h1>
        <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
          A free, open tool for keeping track of who’s who in a book — built so that it never invents what it doesn’t know, and never spoils what
          you haven’t read.
        </p>
      </header>

      <Section title="Where maps come from">
        <p>Every map says where it came from. There are three sources, from most to least careful:</p>
        <div className="space-y-2">
          <Card size="sm" className="gap-1 px-4">
            <div className="flex items-center gap-2">
              <MapMarker className="ring-1 ring-border" />
              <strong className="text-sm text-foreground">Curated</strong>
            </div>
            <p className="text-sm">
              Written by people from the text: typed relationships (family, romance, rivalry…), how they change, and the chapter where you learn
              each fact. Fully spoiler-aware.
            </p>
          </Card>
          <Card size="sm" className="gap-1 px-4">
            <div className="flex items-center gap-2">
              <MapMarker auto className="ring-1 ring-border" />
              <strong className="text-sm text-foreground">Auto-generated from the text</strong>
            </div>
            <p className="text-sm">
              For public-domain novels, a program reads the full text from Project Gutenberg, finds recurring names that behave like people, and links
              characters who are named in the same passages. It knows exactly which chapter everything happens in, so the spoiler shield works — but it
              can’t tell <em>how</em> two people are related, only that they appear together and how often.
            </p>
          </Card>
          <Card size="sm" className="gap-1 px-4">
            <div className="flex items-center gap-2">
              <MapMarker auto className="ring-1 ring-border" />
              <strong className="text-sm text-foreground">From Wikidata</strong>
            </div>
            <p className="text-sm">
              For many other books — including modern ones — we look up the characters and relationships volunteers have recorded on Wikidata. These
              are real, typed relationships, but Wikidata doesn’t know when they happen in the story, so we warn you about spoilers first.
              Character descriptions come from the opening of each character’s Wikipedia article where one exists, credited alongside.
            </p>
          </Card>
        </div>
        <p>
          If none of these sources covers a book, it shows <strong>metadata only</strong>.{' '}
          <strong>We never use AI or guesswork to invent characters</strong> — a wrong character map is worse than none.
        </p>
        <p>
          Curated maps also carry a review status: <ReviewBadge status="unreviewed" /> or <ReviewBadge status="reviewed" />. The curated maps that ship with
          this project are awaiting review.
        </p>
      </Section>

      <Section title="How the spoiler shield works">
        <p>
          The first time you open a mapped book we ask how far you’ve read. Characters first met later, relationships revealed later, and later
          stages of a relationship (an engagement, a betrayal, a death) are hidden until you move the slider past the chapter where they happen.
        </p>
        <p>Your progress is stored only in your browser’s local storage. There are no accounts and no analytics.</p>
      </Section>

      <Section title="Relationship types">
        <div className="grid gap-2 sm:grid-cols-2">
          {RELATION_TYPES.map((t) => (
            <Card key={t} size="sm" className="flex-row items-start gap-3 px-3">
              <span className="mt-2 h-[3px] w-5 shrink-0 rounded" style={{ background: dark ? REL_TYPES[t].dark : REL_TYPES[t].light }} />
              <span>
                <strong className="block text-sm">{REL_TYPES[t].label}</strong>
                <span className="text-sm">{REL_TYPES[t].description}</span>
              </span>
            </Card>
          ))}
        </div>
      </Section>

      <Section title="Where the data comes from">
        <p>
          Book metadata and covers are from{' '}
          <a href="https://openlibrary.org/developers/api" className="text-primary underline" target="_blank" rel="noreferrer">
            Open Library
          </a>
          , a project of the Internet Archive. Public-domain texts come from{' '}
          <a href="https://www.gutenberg.org" className="text-primary underline" target="_blank" rel="noreferrer">
            Project Gutenberg
          </a>{' '}
          (downloaded from its official mirror at build time) and character data from{' '}
          <a href="https://www.wikidata.org" className="text-primary underline" target="_blank" rel="noreferrer">
            Wikidata
          </a>{' '}
          (CC0). The catalogue is pre-built at deploy time and served as a static file. When you search beyond it, or
          open a book’s description, we call Open Library directly — results are cached on your device for a week, requests are queued and spaced
          out, and covers are fetched by cover id (which Open Library doesn’t rate-limit).
        </p>
        <p>The site needs no API keys and no server, so it can run for free on static hosting.</p>
      </Section>

      <Section id="contribute" title="Contributing a map">
        <p>
          Maps are plain JSON files (schema in the project’s <code>schema/</code> folder). To add one: scaffold a file with{' '}
          <code>npm run data:new-map -- OL…W</code>, fill in characters and relationships while reading, note the chapter for every fact, then run{' '}
          <code>npm run data:validate</code>. The validator checks every reference, the reading order of every change, and that nothing appears
          before its character does.
        </p>
        <p>
          Please work from the text (public-domain editions are ideal), cite the edition whose numbering you follow, and keep summaries spoiler-safe
          for the chapter in which a character first appears.
        </p>
      </Section>
    </div>
  );
}
