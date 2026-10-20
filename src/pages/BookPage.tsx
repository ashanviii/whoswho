import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { BookCard } from '../components/BookCard';
import { Cover } from '../components/Cover';
import { MapExplorer } from '../components/graph/MapExplorer';
import { Icon } from '../components/Icon';
import { EmptyState, ErrorState, Spinner } from '../components/States';
import { loadCatalog } from '../lib/catalog';
import { loadMap, loadMapIndex } from '../lib/maps';
import { getAuthorName, getWork, openLibraryWorkUrl, type WorkDetails } from '../lib/openLibrary';
import { useAsync } from '../lib/useAsync';
import { fetchWikidataMap } from '../lib/wikidata';
import type { BookMeta } from '../types/catalog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const WORK_ID = /^OL\d+W$/;

export default function BookPage() {
  const { id = '' } = useParams();
  const valid = WORK_ID.test(id);

  // Core data: catalogue record (if any) + character map (if any).
  const core = useAsync(
    async (signal) => {
      if (!valid) return null;
      const [catalog, map] = await Promise.all([loadCatalog().catch(() => null), loadMap(id)]);
      let book: BookMeta | undefined = catalog?.byId.get(id);
      if (!book) {
        // Not in our catalogue: fetch minimal metadata live from Open Library.
        const work = await getWork(id, signal);
        const authors = (await Promise.all(work.authorKeys.slice(0, 3).map((k) => getAuthorName(k, signal).catch(() => undefined)))).filter(
          (a): a is string => !!a,
        );
        book = {
          id,
          title: work.title ?? map?.title ?? 'Untitled',
          authors: authors.length ? authors : (map?.authors ?? []),
          year: Number(work.firstPublished?.match(/\d{4}/)?.[0]) || undefined,
          coverId: work.coverId,
          genres: [],
          mapped: !!map,
          inCatalog: false,
        };
      }
      return { book: { ...book, mapped: !!map }, map };
    },
    [id],
  );

  // Description and subjects (non-blocking, cached).
  const [work, setWork] = useState<WorkDetails | null>(null);
  useEffect(() => {
    if (!valid) return;
    const ctrl = new AbortController();
    setWork(null);
    getWork(id, ctrl.signal).then(setWork, () => {});
    return () => ctrl.abort();
  }, [id, valid]);

  // No prepared map? Ask Wikidata live (cached per device).
  const needsLookup = core.status === 'success' && !!core.data && !core.data.map;
  const wikidata = useAsync(
    (signal) => (needsLookup && core.data ? fetchWikidataMap(core.data.book, signal) : Promise.resolve(null)),
    [needsLookup, core.data?.book.id],
  );

  useEffect(() => {
    const title = core.data?.book.title;
    document.title = title ? `${title} — Character Chart` : 'Character Chart';
    return () => {
      document.title = 'Character Chart — who’s who in the books you love';
    };
  }, [core.data?.book.title]);

  if (!valid) {
    return (
      <EmptyState icon="book" title="That doesn’t look like a book link" action={<Button asChild size="lg" className="rounded-full px-4"><Link to="/browse">Browse books</Link></Button>}>
        Book pages use Open Library work ids such as <code>OL66554W</code>.
      </EmptyState>
    );
  }
  if (core.status === 'loading') return <Spinner className="py-32" label="Opening book…" />;
  if (core.status === 'error') {
    const notFound = (core.error as { status?: number }).status === 404;
    return notFound ? (
      <EmptyState icon="book" title="Book not found" action={<Button asChild size="lg" className="rounded-full px-4"><Link to="/browse">Browse books</Link></Button>}>
        Open Library has no work with the id <code>{id}</code>.
      </EmptyState>
    ) : (
      <ErrorState title="Couldn’t open this book" error={core.error} onRetry={core.retry} />
    );
  }
  if (!core.data) return null;

  const { book, map } = core.data;
  if (map) return <MapExplorer map={map} book={book} description={work?.description} />;
  if (wikidata.status === 'success' && wikidata.data) {
    return <MapExplorer key="wikidata" map={wikidata.data} book={{ ...book, mapped: true, mapKind: 'wikidata' }} description={work?.description} />;
  }
  return <MetadataOnly book={book} work={work} lookup={wikidata.status} onRetry={wikidata.retry} />;
}

function MetadataOnly({
  book,
  work,
  lookup,
  onRetry,
}: {
  book: BookMeta;
  work: WorkDetails | null;
  lookup: 'loading' | 'success' | 'error';
  onRetry(): void;
}) {
  const [more, setMore] = useState(false);
  const mapped = useAsync(async () => {
    const [index, catalog] = await Promise.all([loadMapIndex(), loadCatalog()]);
    return index
      .filter((m) => m.kind === 'curated')
      .map((m) => catalog.byId.get(m.workId))
      .filter((b): b is BookMeta => !!b);
  }, []);
  const author = book.authors.join(', ');

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <Button asChild variant="ghost" size="sm" className="mb-6 -ml-2 text-muted-foreground">
        <Link to="/browse">
          <Icon name="arrowLeft" size={15} /> Browse
        </Link>
      </Button>
      <div className="grid gap-8 sm:grid-cols-[180px_1fr] md:grid-cols-[220px_1fr]">
        <Cover coverId={book.coverId ?? work?.coverId} title={book.title} author={author} size="L" eager className="mx-auto w-40 sm:w-full" />
        <div className="min-w-0">
          <h1 className="font-serif text-3xl leading-tight font-semibold sm:text-4xl">{book.title}</h1>
          <p className="mt-2 text-muted-foreground">
            {author || 'Unknown author'}
            {book.year ? ` · first published ${book.year}` : ''}
            {book.editions ? ` · ${book.editions.toLocaleString()} editions` : ''}
          </p>

          {lookup === 'loading' ? (
            <Alert className="mt-8 border-0 bg-muted/60 px-4 py-3.5">
              <Icon name="loader" className="animate-spin" />
              <AlertTitle className="font-semibold">Looking for this book’s characters…</AlertTitle>
              <AlertDescription>Checking Wikidata, the free knowledge base.</AlertDescription>
            </Alert>
          ) : lookup === 'error' ? (
            <Alert className="mt-8 border-0 bg-muted/60 px-4 py-3.5">
              <Icon name="alert" />
              <AlertTitle className="font-semibold">Couldn’t reach Wikidata</AlertTitle>
              <AlertDescription>
                <p>We couldn’t check for character data just now.</p>
                <Button variant="outline" size="sm" className="mt-2 rounded-full" onClick={onRetry}>
                  <Icon name="refresh" size={14} /> Try again
                </Button>
              </AlertDescription>
            </Alert>
          ) : (
            <Alert className="mt-8 border-0 bg-muted/60 px-4 py-3.5">
              <Icon name="graph" />
              <AlertTitle className="font-semibold">No character map yet</AlertTitle>
              <AlertDescription>
                <p>
                  Maps come from three places: curated by people, extracted automatically from public-domain texts, or imported from Wikidata.
                  None of them covers this book yet, and we never make up characters to fill the gap.
                </p>
                <Link to="/about#contribute" className="mt-2 inline-flex items-center gap-1 font-medium text-primary no-underline! hover:underline!">
                  How maps are made &amp; how to contribute <Icon name="chevronRight" size={14} />
                </Link>
              </AlertDescription>
            </Alert>
          )}

          {work === null ? (
            <div className="mt-8 space-y-2" aria-hidden>
              <Skeleton className="h-3.5 w-full" />
              <Skeleton className="h-3.5 w-11/12" />
              <Skeleton className="h-3.5 w-3/4" />
            </div>
          ) : (
            work.description && (
              <section className="mt-8">
                <h2 className="mb-2 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">About this book</h2>
                <p className={cn('leading-relaxed whitespace-pre-line', !more && 'line-clamp-6')}>{work.description}</p>
                {work.description.length > 450 && (
                  <Button variant="link" className="h-auto px-0" onClick={() => setMore((m) => !m)}>
                    {more ? 'Show less' : 'Read more'}
                  </Button>
                )}
              </section>
            )
          )}
          {work && work.subjects.length > 0 && (
            <div className="mt-6 flex flex-wrap gap-1.5">
              {work.subjects.map((s) => (
                <Badge key={s} variant="outline" className="text-muted-foreground">
                  {s}
                </Badge>
              ))}
            </div>
          )}
          <Button asChild variant="outline" size="lg" className="mt-8 rounded-full px-4">
            <a href={openLibraryWorkUrl(book.id)} target="_blank" rel="noreferrer">
              View on Open Library <Icon name="external" size={15} />
            </a>
          </Button>
        </div>
      </div>

      {mapped.data && mapped.data.length > 0 && (
        <section className="mt-16">
          <Separator className="mb-10" />
          <h2 className="mb-5 font-serif text-xl font-semibold">Explore a book with a character map</h2>
          <div className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 md:grid-cols-5">
            {mapped.data.map((b) => (
              <BookCard key={b.id} book={b} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
