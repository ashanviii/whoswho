import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import type { BookMeta } from '../types/catalog';
import { Cover } from './Cover';
import { Icon } from './Icon';

/** Small marker for books that have a character map. Books without one stay unmarked. */
export function MapMarker({ className = '', auto = false }: { className?: string; auto?: boolean }) {
  return (
    <span
      className={`pop inline-flex items-center gap-1 rounded-full bg-background/90 px-2 py-0.5 text-[10px] font-semibold shadow-sm backdrop-blur ${auto ? 'text-muted-foreground' : 'text-success'} ${className}`}
      title={auto ? 'Has an automatically generated character map' : 'Has a curated character map'}
    >
      <Icon name="graph" size={11} strokeWidth={2.5} /> {auto ? 'Auto map' : 'Map'}
    </span>
  );
}

export function BookCard({ book, index = 0 }: { book: BookMeta; index?: number }) {
  const author = book.authors.join(', ');
  return (
    <Link
      to={`/book/${book.id}`}
      className="reveal group block rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      style={{ '--i': index % 12 } as CSSProperties}
      title={`${book.title} — ${author}`}
    >
      <div className="relative">
        <Cover
          coverId={book.coverId}
          title={book.title}
          author={author}
          className="transition-transform duration-300 group-hover:-translate-y-1 group-hover:shadow-lg"
        />
        {book.mapped && <MapMarker className="absolute top-2 left-2" auto={book.mapKind !== 'curated'} />}
      </div>
      <h3 className="mt-3 line-clamp-2 text-sm leading-snug font-medium group-hover:text-primary">{book.title}</h3>
      <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
        {author || 'Unknown author'}
        {book.year ? ` · ${book.year}` : ''}
      </p>
    </Link>
  );
}

export function BookGrid({ books }: { books: BookMeta[] }) {
  return (
    <div className="grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
      {books.map((b, i) => (
        <BookCard key={b.id} book={b} index={i} />
      ))}
    </div>
  );
}
