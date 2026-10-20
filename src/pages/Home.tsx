import type * as React from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { BookGrid } from '../components/BookCard';
import { Cover } from '../components/Cover';
import { Icon } from '../components/Icon';
import { SearchBox } from '../components/SearchBox';
import { BookGridSkeleton, ErrorState } from '../components/States';
import { loadCatalog, searchCatalog } from '../lib/catalog';
import { loadMapIndex } from '../lib/maps';
import { useAsync } from '../lib/useAsync';

// Focus the search box only where a keyboard won't pop up over the page.
const finePointer = typeof matchMedia !== 'undefined' && matchMedia('(pointer: fine)').matches;

export function Home() {
  const data = useAsync(async () => {
    const [catalog, index] = await Promise.all([loadCatalog(), loadMapIndex()]);
    return {
      catalog,
      featured: index.filter((m) => m.kind === 'curated').map((m) => ({ summary: m, book: catalog.byId.get(m.workId) })),
      automatic: catalog.books.filter((b) => b.mapped && b.mapKind !== 'curated').slice(0, 12),
      mappedTotal: catalog.books.filter((b) => b.mapped).length,
      popular: searchCatalog(catalog, { genre: 'classics', sort: 'popular' })
        .filter((b) => !b.mapped)
        .slice(0, 12),
    };
  }, []);

  return (
    <div>
      {/* Hero */}
      <section className="mx-auto max-w-2xl px-4 pt-20 pb-16 text-center sm:px-6 sm:pt-28 sm:pb-24">
        <h1 className="font-serif text-5xl leading-[1.02] font-medium tracking-tight text-balance sm:text-7xl">
          <span className="reveal block">Who’s who, and</span>
          <em className="reveal block text-primary" style={{ '--i': 2 } as React.CSSProperties}>
            who’s whose.
          </em>
        </h1>
        <p className="reveal mx-auto mt-6 max-w-md text-base leading-relaxed text-pretty text-muted-foreground sm:text-lg"
          style={{ '--i': 4 } as React.CSSProperties}>
          See how the characters in a book are connected — without spoiling the chapters you haven’t read.
        </p>
        <div className="reveal" style={{ '--i': 6 } as React.CSSProperties}>
          <SearchBox size="lg" autoFocus={finePointer} className="mx-auto mt-10 max-w-xl text-left" placeholder="Search a title or author" />
        </div>
        <p className="mt-5 min-h-5 text-sm text-muted-foreground">
          {data.data ? (
            <>
              <span className="reveal inline-block" style={{ '--i': 8 } as React.CSSProperties}>
              Try{' '}
              {data.data.featured.slice(0, 3).map(({ summary }, i, arr) => (
                <span key={summary.workId}>
                  <Link to={`/book/${summary.workId}`} className="text-foreground underline decoration-border underline-offset-4 hover:decoration-primary">
                    {summary.title}
                  </Link>
                  {i < arr.length - 1 ? ', ' : ''}
                </span>
              ))}
              </span>
            </>
          ) : (
            <span className="invisible">Loading</span>
          )}
        </p>
      </section>

      <div className="mx-auto max-w-6xl space-y-20 px-4 pb-24 sm:px-6">
        {data.status === 'error' && <ErrorState error={data.error} onRetry={data.retry} title="Couldn’t load the catalogue" />}

        <section>
          <SectionHeader title="Character maps" />
          <div className="grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 lg:grid-cols-5">
            {data.status === 'loading'
              ? Array.from({ length: 5 }, (_, i) => (
                  <div key={i}>
                    <Skeleton className="aspect-[2/3]" />
                    <Skeleton className="mt-3 h-4 w-3/4" />
                  </div>
                ))
              : data.data?.featured.map(({ summary, book }, i) => (
                  <Link
                    key={summary.workId}
                    to={`/book/${summary.workId}`}
                    className="reveal group block rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                    style={{ '--i': i } as React.CSSProperties}
                  >
                    <Cover
                      coverId={book?.coverId}
                      title={summary.title}
                      author={summary.authors.join(', ')}
                      className="transition-transform duration-300 group-hover:-translate-y-1 group-hover:shadow-lg"
                    />
                    <h3 className="mt-3 font-serif text-base leading-snug font-semibold group-hover:text-primary">{summary.title}</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {summary.characters} characters · {summary.sections} {summary.sectionLabel.toLowerCase()}
                    </p>
                  </Link>
                ))}
          </div>
        </section>

        {data.data && data.data.automatic.length > 0 && (
          <section>
            <SectionHeader
              title="More books with maps"
              action={
                <Button asChild variant="ghost" className="rounded-full text-muted-foreground hover:text-foreground">
                  <Link to="/browse?mapped=1">
                    All {data.data.mappedTotal.toLocaleString()} <Icon name="chevronRight" size={15} />
                  </Link>
                </Button>
              }
            />
            <p className="-mt-3 mb-6 text-sm text-muted-foreground">Generated automatically from the full text or from Wikidata — marked “Auto map”.</p>
            <BookGrid books={data.data.automatic} />
          </section>
        )}

        <section>
          <SectionHeader
            title="Popular classics"
            action={
              <Button asChild variant="ghost" className="rounded-full text-muted-foreground hover:text-foreground">
                <Link to="/browse">
                  Browse all <Icon name="chevronRight" size={15} />
                </Link>
              </Button>
            }
          />
          {data.status === 'loading' ? <BookGridSkeleton /> : data.data && <BookGrid books={data.data.popular} />}
        </section>

        {data.data && (
          <p className="text-center text-xs text-muted-foreground">
            {data.data.catalog.books.length.toLocaleString()} books catalogued · {data.data.mappedTotal.toLocaleString()} with character maps ·{' '}
            <Link to="/about" className="underline underline-offset-4 hover:text-foreground">
              how it works
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}

function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex items-center justify-between gap-4 border-b pb-3">
      <h2 className="font-serif text-xl font-semibold tracking-tight">{title}</h2>
      {action}
    </div>
  );
}
