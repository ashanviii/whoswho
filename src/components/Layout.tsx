import { useEffect } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useThemePref, type ThemePref } from '../lib/theme';
import { Icon, type IconName } from './Icon';
import { SearchBox } from './SearchBox';

const THEMES: { id: ThemePref; label: string; icon: IconName }[] = [
  { id: 'light', label: 'Light', icon: 'sun' },
  { id: 'dark', label: 'Dark', icon: 'moon' },
  { id: 'system', label: 'System', icon: 'monitor' },
];

export function Logo() {
  return (
    <Link to="/" className="flex shrink-0 items-center gap-2 font-serif text-lg font-semibold tracking-tight whitespace-nowrap">
      <svg viewBox="0 0 64 64" className="size-7" aria-hidden>
        <rect width="64" height="64" rx="16" fill="var(--primary)" />
        <g stroke="var(--primary-foreground)" strokeWidth="3" opacity=".85">
          <line x1="20" y1="22" x2="44" y2="20" />
          <line x1="20" y1="22" x2="30" y2="44" />
          <line x1="44" y1="20" x2="30" y2="44" />
        </g>
        <circle cx="20" cy="22" r="7" fill="var(--primary-foreground)" />
        <circle cx="44" cy="20" r="5.5" fill="var(--primary-foreground)" opacity=".75" />
        <circle cx="30" cy="44" r="6.5" fill="var(--primary-foreground)" />
      </svg>
      <span>Character Chart</span>
    </Link>
  );
}

function ThemeMenu() {
  const [theme, setTheme] = useThemePref();
  const current = THEMES.find((t) => t.id === theme) ?? THEMES[2];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-lg" className="rounded-full" aria-label={`Theme: ${current.label}`}>
          <span key={current.id} className="animate-in duration-300 fade-in spin-in-45 zoom-in-75">
            <Icon name={current.icon} />
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuLabel>Appearance</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup value={theme} onValueChange={(v) => setTheme(v as ThemePref)}>
          {THEMES.map((t) => (
            <DropdownMenuRadioItem key={t.id} value={t.id}>
              <Icon name={t.icon} size={16} /> {t.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Layout() {
  const { pathname } = useLocation();
  const isHome = pathname === '/';
  const isBook = pathname.startsWith('/book/');
  const showHeaderSearch = !isHome && pathname !== '/browse';

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  const nav = (to: string, label: string) => (
    <Button asChild variant="ghost" className="rounded-full px-2.5 sm:px-3">
      <NavLink to={to} className={({ isActive }) => cn(isActive ? 'bg-muted text-foreground' : 'text-muted-foreground')}>
        {label}
      </NavLink>
    </Button>
  );

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Logo />
          {showHeaderSearch && <SearchBox className="ml-auto hidden w-full max-w-xs md:block" />}
          <nav className={cn('flex items-center gap-1', showHeaderSearch ? 'ml-auto md:ml-2' : 'ml-auto')}>
            {nav('/browse', 'Browse')}
            {nav('/about', 'About')}
          </nav>
          <ThemeMenu />
        </div>
      </header>
      <main id="main" className="flex-1">
        {/* Keyed by path (not query) so in-page selection changes don't re-animate. */}
        <div key={pathname} className="page-in">
          <Outlet />
        </div>
      </main>
      {!isBook && (
        <footer>
          <p className="mx-auto max-w-6xl px-4 py-8 text-center text-xs text-muted-foreground sm:px-6">
            Books and covers from{' '}
            <a className="underline underline-offset-4 hover:text-foreground" href="https://openlibrary.org" target="_blank" rel="noreferrer">
              Open Library
            </a>
            . No accounts, no tracking.
          </p>
        </footer>
      )}
    </div>
  );
}
