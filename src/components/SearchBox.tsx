import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { loadCatalog, searchCatalog, type Catalog } from '../lib/catalog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Cover } from './Cover';
import { Icon } from './Icon';

interface Props {
  initial?: string;
  size?: 'md' | 'lg';
  autoFocus?: boolean;
  placeholder?: string;
  /** Called on submit; defaults to navigating to /browse?q= */
  onSubmit?: (q: string) => void;
  className?: string;
}

/** Book search with instant suggestions from the local catalogue. */
export function SearchBox({ initial = '', size = 'md', autoFocus, placeholder, onSubmit, className = '' }: Props) {
  const navigate = useNavigate();
  const [q, setQ] = useState(initial);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  useEffect(() => { setQ(initial); }, [initial]);

  // Load the catalogue lazily on first focus.
  const ensureCatalog = () => {
    if (!catalog) loadCatalog().then(setCatalog, () => {});
  };
  useEffect(() => {
    if (autoFocus) ensureCatalog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // "/" focuses the search box from anywhere.
  useEffect(() => {
    if (size !== 'lg' && !autoFocus) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) && !t.isContentEditable) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [size, autoFocus]);

  const suggestions = useMemo(
    () => (catalog && q.trim().length >= 2 ? searchCatalog(catalog, { query: q }).slice(0, 6) : []),
    [catalog, q],
  );

  const submit = (value: string) => {
    setOpen(false);
    const v = value.trim();
    if (onSubmit) onSubmit(v);
    else navigate(v ? `/browse?q=${encodeURIComponent(v)}` : '/browse');
  };

  const showList = open && suggestions.length > 0;
  const lg = size === 'lg';

  return (
    <form
      role="search"
      className={`relative ${className}`}
      onSubmit={(e) => {
        e.preventDefault();
        if (showList && active >= 0) {
          setOpen(false);
          navigate(`/book/${suggestions[active].id}`);
        } else submit(q);
      }}
    >
      <Icon name="search" size={lg ? 20 : 16} className={cn('pointer-events-none absolute top-1/2 z-10 -translate-y-1/2 text-muted-foreground', lg ? 'left-5' : 'left-3.5')} />
      <Input
        ref={inputRef}
        type="search"
        value={q}
        autoFocus={autoFocus}
        onFocus={() => {
          ensureCatalog();
          setOpen(true);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onKeyDown={(e) => {
          if (!showList) return;
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, suggestions.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, -1));
          } else if (e.key === 'Escape') setOpen(false);
        }}
        placeholder={placeholder ?? 'Search by title or author'}
        aria-label="Search books by title or author"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
        enterKeyHint="search"
        className={cn(
          'rounded-full bg-card [&::-webkit-search-cancel-button]:hidden',
          lg ? 'h-14 pr-28 pl-13 text-base shadow-sm md:text-base' : 'h-10 pr-9 pl-10',
        )}
      />
      {q && !lg && (
        <Button type="button" variant="ghost" size="icon-xs" aria-label="Clear search" onClick={() => setQ('')} className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full text-muted-foreground">
          <Icon name="x" size={14} />
        </Button>
      )}
      {lg && (
        <Button type="submit" size="lg" className="absolute top-1/2 right-2 h-10 -translate-y-1/2 rounded-full px-5">
          Search
        </Button>
      )}
      {showList && (
        <ul id={listId} role="listbox" className="absolute top-full right-0 left-0 z-40 mt-2 animate-in overflow-hidden rounded-xl bg-popover p-1.5 text-popover-foreground shadow-xl ring-1 ring-foreground/10 duration-150 fade-in slide-in-from-top-1">
          {suggestions.map((b, i) => (
            <li
              key={b.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                setOpen(false);
                navigate(`/book/${b.id}`);
              }}
              onMouseEnter={() => setActive(i)}
              className={cn('reveal flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 transition-colors', i === active && 'bg-accent text-accent-foreground')}
              style={{ '--i': i, animationDuration: '0.35s' } as React.CSSProperties}
            >
              <Cover coverId={b.coverId} title={b.title} size="S" className="w-8 shrink-0" />
              <div className="min-w-0 flex-1 text-left">
                <div className="truncate text-sm font-medium">{b.title}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {b.authors.join(', ')}
                  {b.year ? ` · ${b.year}` : ''}
                </div>
              </div>
              {b.mapped && <Badge className="border-transparent bg-success-soft text-[10px] font-semibold text-success">Map</Badge>}
            </li>
          ))}
          <li
            role="option"
            aria-selected={false}
            onMouseDown={(e) => {
              e.preventDefault();
              submit(q);
            }}
            className="cursor-pointer rounded-lg px-3 py-2 text-xs font-medium text-primary hover:bg-accent"
          >
            See all results for “{q.trim()}” →
          </li>
        </ul>
      )}
    </form>
  );
}
