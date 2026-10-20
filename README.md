# Character Chart

**Who's who, and who's whose.** Search thousands of books and explore interactive, spoiler-aware maps of their characters and relationships: family, romance, friendship, rivalry and more.

- **4,930 books** catalogued from [Open Library](https://openlibrary.org): title, author, year, cover and description.
- **Character maps from three sources**, each clearly labelled:
  - **9 hand-curated maps** with typed relationships and chapter-by-chapter spoiler data: *Pride and Prejudice*, *Jane Eyre*, *The Great Gatsby*, *A Christmas Carol*, *Alice's Adventures in Wonderland*, *Romeo and Juliet*, *Hamlet*, *Macbeth* and *Othello*.
  - **80 automatic maps** extracted from the full public-domain text (Project Gutenberg). They're spoiler-aware, but links only say who appears together, not how they're related.
  - **Live Wikidata maps** for any book, including modern copyrighted ones, whose characters and relationships volunteers have recorded on Wikidata (126 catalogue books today). They're typed, use character descriptions from Wikipedia where available, and come with a spoiler warning.
- **A spoiler shield.** Tell it how far you've read. Characters, relationships and plot developments after that chapter or scene stay hidden.
- **No fabricated data.** No AI or guesswork. A book none of the three sources covers is labelled **Metadata only**.
- **₹0 to run.** It's a static site with no backend, no database, no API keys and no paid services.

Stack: React 19 · TypeScript · Tailwind CSS 4 · [shadcn/ui](https://ui.shadcn.com) (Radix primitives, Lucide icons) · Cytoscape.js (fCoSE layout) · Vite · Vitest.

---

## Quick start

Requires **Node.js 20+**.

```bash
npm install
npm run dev
```

Then open http://localhost:5173. The generated catalogue and maps are already included in `public/data/`, so the app works straight away with no network setup.

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Validate maps → type-check → production build into `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm test` | Unit tests (spoiler engine, validator, search) |
| `npm run data:catalog` | Re-fetch the catalogue from Open Library (cached and rate-limited) |
| `npm run data:auto -- --limit 200` | Generate automatic maps from Project Gutenberg texts (mirror, cached) |
| `npm run data:wikidata` | Record which catalogue books Wikidata can map |
| `npm run data:validate` | Validate every map in `data/maps/` |
| `npm run data:build` | Publish catalogue + maps to `public/data/` |
| `npm run data:new-map -- OL123W --sections 30` | Scaffold a new map file |
| `npm run data:sql` | Export everything as SQL inserts (optional DB path) |

---

## Features

**Search & browse**
- Instant type-ahead search over the local catalogue: accent-insensitive, ranked by title match, author match and popularity.
- Filter by genre and by "Has character map". Sort by relevance, editions, title or year.
- If a book isn't in the catalogue, you can search all of Open Library live. This only runs when you ask, to respect their API.

**Graph explorer** (mapped books)
- Force-directed graph (Cytoscape.js + fCoSE). Node size reflects how important the character is, colour shows their family or faction, and the protagonist gets a ring.
- Edges are coloured and styled by relationship type: family, romance, friendship, rivalry, alliance, mentorship, service, acquaintance.
- Tap a character to see their profile: summary, "story so far" timeline and connections grouped by type. Tap an edge to see how that relationship changes over time.
- Character search (`/`), relationship-type filters, a "hide minor characters" toggle, zoom (`+`/`-`), fit (`0`), re-arrange, PNG export and full screen.
- An accessible **List view** gives the same information without the canvas.
- The selection is stored in the URL (`?c=darcy`), so links are shareable.

**Spoiler shield**
- On first visit you're asked how far you've read. The slider goes chapter by chapter (or scene by scene for plays), with step buttons.
- Relationships have **phases**. Darcy and Elizabeth start as *Mutual dislike* (Ch. 3), then *Rejected proposal* (Ch. 34), then *Engaged* (Ch. 58). You only see the phases you've reached.
- Progress is saved per book in `localStorage`. There are no accounts and no analytics.

**Polish**
- Light and dark themes (follows your system setting, with a manual toggle). Layout is mobile-first, with a bottom sheet on phones and a side panel on desktop.
- Loading skeletons, empty states, error states with retry, and a not-found page.
- Cytoscape (about 177 kB gzipped) is lazy-loaded only on book pages.

---

## Architecture

```
┌────────────── build time (your machine / CI) ──────────────┐     ┌──────── browser ────────┐
│                                                            │     │                         │
│  Open Library Search API ──► fetch-catalog.ts ──┐          │     │  React SPA              │
│  (rate-limited, disk-cached)                    ▼          │     │   ├─ /data/catalog.json │
│                              data/catalog/openlibrary.json │     │   ├─ /data/maps/*.json  │
│                                                 │          │     │   └─ Open Library API   │
│  data/maps/*.json ──► validate-maps.ts ──► build-data.ts ──┼──►  │      (descriptions,     │
│  (hand-curated)       (blocks bad data)    public/data/    │     │       live search,      │
│                                                            │     │       covers by id)     │
└────────────────────────────────────────────────────────────┘     └─────────────────────────┘
```

There's **no backend** because nothing needs one. The catalogue and maps are static JSON served from the CDN. Open Library allows CORS and needs no key, so the browser calls it directly for the few things that are fetched live. Because there are no secrets anywhere, none can leak into the frontend.

### Being a good Open Library citizen

- **Build time:** `scripts/lib/polite-fetch.ts` sends one request at a time, at least 1.2 s apart, with exponential backoff on 429/5xx, `Retry-After` support and an identifying `User-Agent`. Set `OL_CONTACT` in `.env` (see `.env.example`). Every response is cached in `.cache/` for 30 days, so a re-run costs nothing.
- **Runtime:** `src/lib/openLibrary.ts` allows at most 2 concurrent requests, 350 ms apart. Responses are cached in memory and in `localStorage` (7-day TTL, bounded size). Identical concurrent requests are de-duplicated, and it backs off on 429.
- **Covers** are always loaded by numeric cover id (`/b/id/{id}-M.jpg`). Open Library doesn't rate-limit those. It does limit ISBN/OLID cover lookups, and this app never uses them.

### Project layout

```
data/
  catalog/openlibrary.json   raw catalogue pulled from Open Library
  maps/OL…W.json             source of truth for character maps (hand-edited)
  auto/OL…W.json             automatic maps (generated by `npm run data:auto`; do not hand-edit)
  catalog/wikidata.json      which catalogue books Wikidata can map (`npm run data:wikidata`)
public/data/                 generated by `npm run data:build` and served to the app
schema/
  character-map.schema.json  JSON Schema for map files
  database.sql               relational schema (SQLite / D1 / Postgres)
scripts/                     data pipeline (fetch → auto-extract → validate → build → export)
  lib/extract-characters.ts  name detection + co-occurrence extractor (try it: npx tsx scripts/try-extract.ts <file.txt>)
src/
  types/                     shared TS types (used by app *and* scripts)
  lib/spoilers.ts            pure spoiler engine (unit-tested)
  lib/catalog.ts             catalogue loading + search
  lib/openLibrary.ts         cached, queued Open Library client
  lib/wikidata.ts            live Wikidata maps + Wikipedia descriptions
  components/ui/             shadcn/ui components (generated by the shadcn CLI; edit freely)
  components/graph/          Cytoscape canvas, explorer, panels, spoiler controls
  pages/                     Home, Browse, Book, About, NotFound
```

---

## UI components (shadcn/ui)

The interface is built from [shadcn/ui](https://ui.shadcn.com) components in `src/components/ui/`, configured by `components.json` (Radix base, Nova preset, Lucide icons). The theme lives in `src/index.css` as shadcn CSS variables (`--background`, `--primary`, `--muted-foreground`…), tuned to the app's warm paper-and-oxblood palette, with light and dark variants. `--primary-soft` and `--success` are app-specific extras.

| Where | Components |
| --- | --- |
| Header | Button, DropdownMenu (theme picker) |
| Search & browse | Input, Toggle, Select, Badge, Separator, Skeleton |
| Book pages | Card, Alert, Badge, Button |
| Graph explorer | Popover + Slider (spoiler shield), Popover + Switch + Label (filters), ToggleGroup (graph/list), Tooltip (zoom controls), ScrollArea (side panel), Sheet (non-modal bottom sheet on phones), Collapsible (map provenance), Toggle (relationship-type legend) |

To add more: `npx shadcn@latest add <component>`.

---

## Data model

A **map** covers one Open Library work. Every fact is tagged with the **section** (chapter, scene, letter…) where a first-time reader learns it. See `src/types/map.ts` and `schema/character-map.schema.json`.

```jsonc
{
  "schemaVersion": 1,
  "workId": "OL66554W",
  "title": "Pride and Prejudice",
  "edition": { "description": "Continuous chapter numbering 1–61", "source": "Project Gutenberg eBook #1342" },
  "sectionLabel": { "singular": "Chapter", "plural": "Chapters" },
  "sections": [{ "id": "c1", "label": "Ch. 1", "part": "Volume I" } /* … */],
  "groups": [{ "id": "bennet", "label": "The Bennets" }],
  "characters": [{
    "id": "darcy", "name": "Fitzwilliam Darcy", "role": "protagonist", "group": "darcy",
    "firstAppearance": "c3",
    "summary": "Wealthy, reserved master of Pemberley…",          // safe to read at c3
    "notes": [{ "at": "c34", "text": "Proposes to Elizabeth and is refused." }]
  }],
  "relationships": [{
    "id": "r29", "source": "darcy", "target": "elizabeth",
    "phases": [
      { "at": "c3",  "type": "rivalry", "label": "Mutual dislike" },
      { "at": "c34", "type": "romance", "label": "Rejected proposal" },
      { "at": "c58", "type": "romance", "label": "Engaged", "sourceRole": "Fiancé", "targetRole": "Fiancée" }
    ]
  }],
  "provenance": { "method": "…", "contributors": ["…"], "createdAt": "…", "updatedAt": "…",
                  "review": { "status": "unreviewed" } },
  "license": "CC BY 4.0"
}
```

**Spoiler rule.** For reader progress *p* (a section index), a character is visible if `firstAppearance ≤ p`. A relationship is visible if both characters are visible and its first phase `≤ p`, and it shows the latest phase `≤ p`. Notes follow the same rule. This logic lives in `src/lib/spoilers.ts`, and a test checks it for every map at every section.

**Validation** (`npm run data:validate`, which also runs as part of `npm run build` and CI) checks:
- ids are unique, and every reference points to a real character, section or group
- phases and notes are in reading order
- no note comes before its character's first appearance
- `reviewed` status requires reviewers
- warnings for orphan characters and for relationships revealed before both characters have appeared

### Where maps come from (`provenance.kind`)

| Kind | Source | Relationship types | Spoiler shield | Marker |
| --- | --- | --- | --- | --- |
| `curated` | People, from the text (`data/maps/`) | Yes, and how they change | Yes, per chapter or scene | **Map** |
| `auto-text` | Full public-domain text, analysed at build time (`data/auto/`) | No: only "appear together", growing stronger as they share passages | Yes, per detected chapter | **Auto map** |
| `wikidata` | Wikidata statements, fetched live in the browser | Yes (father, sibling, spouse, enemy, kinship like "uncle"…) | No: shown after a spoiler warning | **Auto map** |
| none | n/a | n/a | n/a | metadata only |

Lookup order for a book page is curated → auto-text → Wikidata (live) → metadata only.

**How auto-text extraction works** (`scripts/lib/extract-characters.ts`, no AI, no paid APIs):
1. Strip the Gutenberg licence, editors' prefaces and illustration captions, then split chapters. It recognises "Chapter/Stave/Letter …", "I. TITLE", or a bare number line, and falls back to equal parts.
2. Collect capitalised names and keep those with evidence of being people: honorifics, speech verbs ("said Wickham"), person-like context, a first-name lexicon. Drop places, nationalities and common nouns.
3. Merge aliases conservatively. "Darcy" goes into "Mr. Darcy", "Mr. Edgar" into "Edgar Linton", and a dominant bare surname ("Scrooge") absorbs its titled forms. It never merges a woman's title into a man's name, or a name into someone introduced later. Ambiguous surnames ("Bennet") are left alone.
4. Link characters named in the same or adjacent paragraphs. Each link gets phases ("Appear together" → "Often together" → "Constantly together") at the chapter where it reaches that level, so its strength never spoils the future.

Known limits: nicknames aren't merged ("Lizzy" ≠ "Elizabeth"), one name can stand for two people ("Catherine" in *Wuthering Heights*), plays are skipped, and the odd non-character slips through. The UI says so on every automatic map.

**Wikidata** (`src/lib/wikidata.ts`): finds the work by Open Library id (P648), or by exact title and author. It lists characters (P674/P1441) and statements between them, uses kinship qualifiers (P1039) for precise labels, and colours shared surnames. Character descriptions come from the opening sentences of each character's English Wikipedia article, fetched 20 at a time and credited (CC BY-SA 4.0). Pages that only redirect into a "List of … characters" section are skipped. That's two small SPARQL queries and one or two Wikipedia calls per book, cached for a week on the device (including "nothing found").

> **About the curated maps:** the nine included maps were drafted from the public-domain texts with AI assistance. Their status is honestly marked `unreviewed`. Before calling a map reviewed, have a person check the chapter and scene numbers against the stated edition, then set `review.status` to `"reviewed"` with `reviewedBy` and `reviewedAt`.

---

## Adding a map

```bash
npm run data:new-map -- OL12345W --sections 47        # novel with 47 chapters
npm run data:new-map -- OL67890W --scenes 5,4,4,7,2    # play: scenes per act
# edit data/maps/<id>.json while reading the book
npm run data:validate
npm run data:build                                      # publishes to public/data
```

Guidelines:
- Work from the text, ideally a public-domain edition, and record which edition's numbering you follow.
- Write `summary` so it's spoiler-free as of the character's first appearance. Put later developments in `notes`.
- Model change over time as relationship **phases**, not as separate relationships.
- Use `sourceRole` and `targetRole` ("Father" / "Daughter") so profiles read naturally from either side.

### Scaling the pipeline

- **More catalogue:** raise `PER_SORT` or add genres in `scripts/fetch-catalog.ts`. Client search is a simple linear scan over pre-normalised strings, which is instant at this size. Measure before growing far beyond ~50k rows; past that, shard `catalog.json` (for example by first letter) or move search into a database.
- **More maps:** each map is its own lazily-fetched file, so 10,000 maps cost nothing until someone opens one. `maps/index.json` stays small.
- **Database:** `npm run data:sql` writes `data/export/seed.sql` for `schema/database.sql`. Both work with SQLite, **Cloudflare D1** (free tier) and Postgres (for example Supabase's free tier). Use them when you want community editing or moderation. The static JSON can still be generated from the database.
- **More automatic maps:** `npm run data:auto -- --limit 1000` processes more of the catalogue. It downloads one text every 2 seconds from Gutenberg's official mirror (never the main site, per their robot policy) and caches every text, so re-runs are offline. It matches books using Gutenberg's public-domain catalogue file.
- **Automation:** run `data:catalog`, `data:wikidata` and `data:auto` on a schedule (for example monthly GitHub Actions). Curated maps change through pull requests, gated by `data:validate` in CI (`.github/workflows/ci.yml`).

---

## Deploying for free

The output is a static `dist/` folder. Any of these free tiers work:

**Cloudflare Pages** (recommended: unlimited bandwidth on the free plan)
- Build command `npm run build`, output directory `dist`.
- `public/_redirects` (SPA fallback) and `public/_headers` (CSP and caching) are picked up automatically.

**Netlify:** same settings as Cloudflare Pages. `_redirects` and `_headers` also work there.

**Vercel:** import the repo. `vercel.json` handles rewrites and headers.

**GitHub Pages:** enable *Settings → Pages → Source: GitHub Actions*. `.github/workflows/pages.yml` builds with hash routing (`VITE_ROUTER=hash`) and the repo sub-path (`VITE_BASE=/<repo>/`), because Pages has no SPA fallback.

There are no environment variables to set for the site. `OL_CONTACT` is only used by the local data scripts.

---

## Privacy & security

- No cookies, accounts, analytics or third-party trackers.
- `localStorage` holds only your theme, your per-book reading progress and cached Open Library responses.
- A strict Content Security Policy (`public/_headers`, `vercel.json`) allows only this site, Open Library, the Wikidata query service and the English Wikipedia API. Fonts (Figtree and Newsreader) are self-hosted, so there are no third-party font requests.
- No secrets exist in this project. The only optional value, `OL_CONTACT`, is read by the build-time scripts and never bundled.

## Credits & licenses

- Book metadata and covers: [Open Library](https://openlibrary.org) (Internet Archive). Covers are subject to their own rights.
- Public-domain texts for automatic maps: [Project Gutenberg](https://www.gutenberg.org), via its official mirror.
- Live character data: [Wikidata](https://www.wikidata.org) (CC0). Character descriptions: [Wikipedia](https://en.wikipedia.org) (CC BY-SA 4.0), credited next to each description.
- Character map data in `data/maps/`: CC BY 4.0.
- Source texts referenced: Project Gutenberg and the Folger Shakespeare Library editions.
