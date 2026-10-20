import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BookGrid } from '../components/BookCard';
import { Icon } from '../components/Icon';
import { BookGridSkeleton, EmptyState, ErrorState, Spinner } from '../components/States';
import { loadCatalog, searchCatalog, type SortKey } from '../lib/catalog';
import { searchOpenLibrary } from '../lib/openLibrary';
import { useAsync } from '../lib/useAsync';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Toggle } from '@/components/ui/toggle';

const PAGE = 48;
const SORTS: { id: SortKey; label: string }[] = [
  { id: 'relevance', label: 'Best match' },
  { id: 'popular', label: 'Most editions' },
  { id: 'title', label: 'Title A–Z' },
  { id: 'oldest', label: 'Oldest first' },
  { id: 'newest', label: 'Newest first' },
];

export function Browse() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const genre = params.get('genre') ?? '';
  const mappedOnly = params.get('mapped') === '1';
  const sort = (params.get('sort') as SortKey | null) ?? (q ? 'relevance' : 'popular');
  const live = params.get('live') === '1';

  const [input, setInput] = useState(q);
  const [limit, setLimit] = useState(PAGE);
  useEffect(() => { setInput(q); }, [q]);
  useEffect(() => { setLimit(PAGE); }, [q, genre, mappedOnly, sort]);

  const update = (patch: Record<string, string | null>) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(patch)) {
          if (v) next.set(k, v);
          else next.delete(k);
        }
        return next;
      },
      { replace: true },
    );

  // Live-update the URL as the user types (debounced).
  useEffect(() => {
    if (input === q) return;
    const t = setTimeout(() => update({ q: input.trim() || null, live: null, sort: null }), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input]);

  const catalog = useAsync(() => loadCatalog(), []);
  const deferredQ = useDeferredValue(q);
  const results = useMemo(
    () => (catalog.data ? searchCatalog(catalog.data, { query: deferredQ, genre: genre || undefined, mappedOnly, sort }) : []),
    [catalog.data, deferredQ, genre, mappedOnly, sort],
  );

  useEffect(() => {
    document.title = q ? `“${q}” — Character Chart` : 'Browse books — Character Chart';
  }, [q]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <h1 className="mb-4 font-serif text-3xl font-semibold tracking-tight">{q ? 'Search' : 'Browse'}</h1>

      {/* Controls */}
      <div className="sticky top-14 z-20 -mx-4 mb-8 border-b border-border/70 bg-background/90 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <form
            role="search"
            className="relative md:max-w-sm md:flex-1"
            onSubmit={(e) => {
              e.preventDefault();
              update({ q: input.trim() || null, live: null });
            }}
          >
            <Icon name="search" size={16} className="pointer-events-none absolute top-1/2 left-3.5 z-10 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Title or author"
              aria-label="Search by title or author"
              className="h-9 rounded-full bg-card pl-10"
              enterKeyHint="search"
            />
          </form>
          <div className="flex flex-wrap items-center gap-2">
            <Toggle
              variant="outline"
              size="lg"
              pressed={mappedOnly}
              onPressedChange={(on) => update({ mapped: on ? '1' : null })}
              className="rounded-full bg-card px-3.5 data-[state=on]:border-success/40 data-[state=on]:bg-success-soft data-[state=on]:text-success"
            >
              <Icon name="graph" size={14} /> With maps
            </Toggle>
            <Select value={genre || 'all'} onValueChange={(v) => update({ genre: v === 'all' ? null : v })}>
              <SelectTrigger aria-label="Genre" className="h-9 min-w-36 rounded-full bg-card">
                <SelectValue placeholder="All genres" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All genres</SelectItem>
                {catalog.data?.genres.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sort} onValueChange={(v) => update({ sort: v })}>
              <SelectTrigger aria-label="Sort by" className="h-9 min-w-36 rounded-full bg-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORTS.filter((s) => q || s.id !== 'relevance').map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(q || genre || mappedOnly) && (
              <Button variant="ghost" size="lg" className="rounded-full text-muted-foreground" onClick={() => setParams({}, { replace: true })}>
                <Icon name="x" size={14} /> Clear
              </Button>
            )}
          </div>
        </div>
      </div>

      {catalog.status === 'loading' && <BookGridSkeleton count={18} />}
      {catalog.status === 'error' && <ErrorState title="Couldn’t load the catalogue" error={catalog.error} onRetry={catalog.retry} />}

      {catalog.status === 'success' && (
        <>
          {results.length > 0 ? (
            <>
              <p className="mb-5 text-sm text-muted-foreground" aria-live="polite">
                {results.length.toLocaleString()} {results.length === 1 ? 'book' : 'books'}
                {q && (
                  <>
                    {' '}
                    matching <span className="font-medium text-foreground">“{q}”</span>
                  </>
                )}
              </p>
              <BookGrid books={results.slice(0, limit)} />
              {results.length > limit && (
                <div className="mt-10 flex justify-center">
                  <Button variant="outline" size="lg" className="rounded-full px-5" onClick={() => setLimit((l) => l + PAGE)}>
                    Show more ({(results.length - limit).toLocaleString()} left)
                  </Button>
                </div>
              )}
            </>
          ) : (
            <EmptyState
              title={q ? `No catalogued books match “${q}”` : 'No books match these filters'}
              action={
                q && !live ? (
                  <Button size="lg" className="rounded-full px-5" onClick={() => update({ live: '1' })}>
                    <Icon name="globe" size={16} /> Search all of Open Library
                  </Button>
                ) : mappedOnly || genre ? (
                  <Button variant="outline" size="lg" className="rounded-full px-5" onClick={() => update({ mapped: null, genre: null })}>
                    Clear filters
                  </Button>
                ) : undefined
              }
            >
              {q
                ? 'Our catalogue covers popular works. Open Library has millions more — searching it is free but counts against their API, so we only do it when you ask.'
                : 'Try removing a filter.'}
            </EmptyState>
          )}

          {q && !live && results.length > 0 && (
            <div className="mt-14 flex flex-col items-center gap-3 text-center">
              <Separator className="mb-7" />
              <p className="text-sm text-muted-foreground">Not the book you’re looking for?</p>
              <Button variant="outline" size="lg" className="rounded-full px-5" onClick={() => update({ live: '1' })}>
                <Icon name="globe" size={16} /> Search all of Open Library for “{q}”
              </Button>
            </div>
          )}

          {q && live && <LiveResults query={q} known={catalog.data} />}
        </>
      )}
    </div>
  );
}

function LiveResults({ query, known }: { query: string; known: Awaited<ReturnType<typeof loadCatalog>> }) {
  const res = useAsync((signal) => searchOpenLibrary(query, signal), [query]);
  // Only show what the local catalogue doesn't already have.
  const books = res.data?.filter((b) => !known.byId.has(b.id));

  return (
    <section className="mt-14">
      <Separator className="mb-10" />
      <div className="mb-6 flex items-center gap-2">
        <Icon name="globe" size={18} className="text-muted-foreground" />
        <h2 className="font-serif text-xl font-semibold">From Open Library</h2>
        <Badge variant="secondary">live · metadata only</Badge>
      </div>
      {res.status === 'loading' && <Spinner className="py-10" label="Searching Open Library…" />}
      {res.status === 'error' && <ErrorState title="Open Library search failed" error={res.error} onRetry={res.retry} />}
      {res.status === 'success' &&
        (books && books.length > 0 ? (
          <BookGrid books={books} />
        ) : (
          <EmptyState title={res.data?.length ? 'Nothing beyond what’s already listed above' : `Open Library has nothing for “${query}”`}>
            Check the spelling, or try just the author’s surname.{' '}
            <Link to="/browse" className="text-primary underline">
              Browse instead
            </Link>
            .
          </EmptyState>
        ))}
    </section>
  );
}
