import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { REL_TYPES, ROLE_SIZE, groupColor, relColor } from '../../lib/relTypes';
import { buildView } from '../../lib/spoilers';
import { readJSON, writeJSON } from '../../lib/storage';
import { useIsDark } from '../../lib/theme';
import type { BookMeta } from '../../types/catalog';
import { RELATION_TYPES, type CharacterMap, type RelationType } from '../../types/map';
import { Cover } from '../Cover';
import { Icon, type IconName } from '../Icon';
import { GraphCanvas, type GraphEdge, type GraphHandle, type GraphNode, type Selection } from './GraphCanvas';
import { CharacterPanel, ListView, OverviewPanel, RelationshipPanel, TypeFilters } from './Panels';
import { progressIndex, SpoilerControl, SpoilerGate, SpoilerWarning, type Progress } from './SpoilerControl';
import { MapKindBadge } from './Panels';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/** Shared look for controls floating over the graph. */
const FLOATING = 'border-transparent bg-card/90 shadow-sm ring-1 ring-foreground/8 backdrop-blur dark:bg-card/90';

interface Props {
  map: CharacterMap;
  book: BookMeta;
  description?: string;
}

const isTyping = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable);
};

export function MapExplorer({ map, book, description }: Props) {
  const dark = useIsDark();
  const graphRef = useRef<GraphHandle>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const [params, setParams] = useSearchParams();

  // Reading progress (persisted per book; undefined = not chosen yet).
  const progressKey = `cc:progress:${map.workId}`;
  const [progress, setProgressState] = useState<Progress | undefined>(() => readJSON<Progress | undefined>(progressKey, undefined));
  const setProgress = (p: Progress) => {
    const clamped = p === 'all' ? p : Math.max(0, Math.min(map.sections.length - 1, p));
    writeJSON(progressKey, clamped);
    setProgressState(clamped);
  };

  // Wikidata maps have no chapter data, so the spoiler slider can't apply.
  const kind = map.provenance.kind ?? 'curated';
  const spoilerAware = map.sections.length > 1;

  const [enabled, setEnabled] = useState<Set<RelationType>>(() => new Set(RELATION_TYPES));
  const [showMinor, setShowMinor] = useState(true);
  const [mode, setMode] = useState<'graph' | 'list'>('graph');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [fullscreen, setFullscreen] = useState(false);

  const view = useMemo(() => buildView(map, progressIndex(progress ?? 'all')), [map, progress]);

  // Selection lives in the URL (?c=character or ?r=relationship) so it can be shared.
  const selection: Selection = useMemo(() => {
    const c = params.get('c');
    const r = params.get('r');
    if (c && view.characters.some((x) => x.id === c)) return { kind: 'node', id: c };
    if (r && view.relationships.some((x) => x.id === r)) return { kind: 'edge', id: r };
    return null;
  }, [params, view]);

  const currentKey = useRef<string | null>(null);
  currentKey.current = selection ? `${selection.kind}:${selection.id}` : null;

  const select = useCallback(
    (sel: Selection) => {
      // Re-tapping the current selection on a phone reopens its details sheet.
      if (sel && `${sel.kind}:${sel.id}` === currentKey.current && matchMedia('(max-width: 1023px)').matches) setSheetOpen(true);
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete('c');
          next.delete('r');
          if (sel) next.set(sel.kind === 'node' ? 'c' : 'r', sel.id);
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const selectCharacter = useCallback(
    (id: string) => {
      select({ kind: 'node', id });
      graphRef.current?.focus(id);
    },
    [select],
  );

  // Graph elements derived from the spoiler view + filters.
  const { nodes, edges } = useMemo(() => {
    const visibleChars = view.characters.filter((c) => showMinor || c.role !== 'minor' || selection?.id === c.id);
    const ids = new Set(visibleChars.map((c) => c.id));
    const nodes: GraphNode[] = visibleChars.map((c) => ({
      id: c.id,
      label: c.name,
      role: c.role,
      color: groupColor(c.group, map.groups),
      size: ROLE_SIZE[c.role],
    }));
    const edges: GraphEdge[] = view.relationships
      .filter((r) => enabled.has(r.current.type) && ids.has(r.source) && ids.has(r.target))
      .map((r) => ({
        id: r.id,
        source: r.source,
        target: r.target,
        type: r.current.type,
        label: r.current.label,
        color: relColor(r.current.type, dark),
        // Automatic links thicken as characters share more passages (strength known up to this point only).
        width: r.current.weight ? Math.min(5, 1.2 + Math.log2(r.current.weight) * 0.6) : REL_TYPES[r.current.type].width,
        line: REL_TYPES[r.current.type].line,
      }));
    return { nodes, edges };
  }, [view, enabled, showMinor, dark, map.groups, selection?.id]);

  // On phones, open the details sheet once a new selection has actually landed
  // (opening it earlier would flash the previous panel).
  const selectionKey = selection ? `${selection.kind}:${selection.id}` : null;
  useEffect(() => {
    if (selectionKey && matchMedia('(max-width: 1023px)').matches) setSheetOpen(true);
  }, [selectionKey]);

  // On phones the details sheet covers the lower half, so lift the selected character into view.
  useEffect(() => {
    if (selection?.kind !== 'node' || !sheetOpen || !matchMedia('(max-width: 1023px)').matches) return;
    const t = setTimeout(() => graphRef.current?.focus(selection.id, 0.22), 60);
    return () => clearTimeout(t);
  }, [selection, sheetOpen]);

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Escape') select(null);
      else if (e.key === '+' || e.key === '=') graphRef.current?.zoomBy(1.25);
      else if (e.key === '-') graphRef.current?.zoomBy(0.8);
      else if (e.key === '0') graphRef.current?.fit();
      else if (e.key === '/') {
        e.preventDefault();
        document.getElementById('character-search')?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [select]);

  // Fullscreen tracking.
  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === shellRef.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);
  const canFullscreen = typeof document !== 'undefined' && !!document.documentElement.requestFullscreen;

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return view.characters
      .filter((c) => [c.name, ...(c.aliases ?? [])].some((n) => n.toLowerCase().includes(q)))
      .slice(0, 8);
  }, [query, view]);

  const selectedChar = selection?.kind === 'node' ? view.characters.find((c) => c.id === selection.id) : undefined;
  const selectedRel = selection?.kind === 'edge' ? view.relationships.find((r) => r.id === selection.id) : undefined;

  const panel = selectedChar ? (
    <CharacterPanel
      map={map}
      view={view}
      character={selectedChar}
      onSelectCharacter={selectCharacter}
      onSelectRelationship={(id) => select({ kind: 'edge', id })}
    />
  ) : selectedRel ? (
    <RelationshipPanel map={map} view={view} rel={selectedRel} onSelectCharacter={selectCharacter} />
  ) : (
    <OverviewPanel map={map} view={view} description={description} onSelectCharacter={selectCharacter} />
  );

  const downloadPng = () => {
    const uri = graphRef.current?.toPng();
    if (!uri) return;
    const a = document.createElement('a');
    a.href = uri;
    a.download = `${map.title.replace(/[^\w]+/g, '-').toLowerCase()}-characters.png`;
    a.click();
  };

  const toggleType = (t: RelationType) =>
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });

  const filterControls = (
    <div className="space-y-4">
      <div>
        <div className="mb-2 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Relationship types</div>
        <TypeFilters view={view} enabled={enabled} onToggle={toggleType} />
        <div className="mt-2 flex gap-1">
          <Button variant="link" size="sm" className="h-auto px-0" onClick={() => setEnabled(new Set(RELATION_TYPES))}>
            Show all
          </Button>
          <span className="text-muted-foreground">·</span>
          <Button variant="link" size="sm" className="h-auto px-0 text-muted-foreground" onClick={() => setEnabled(new Set())}>
            Hide all
          </Button>
        </div>
      </div>
      <Separator />
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="show-minor" className="font-normal">
          Show minor characters
        </Label>
        <Switch id="show-minor" checked={showMinor} onCheckedChange={setShowMinor} />
      </div>
    </div>
  );

  const zoomButtons: { icon: IconName; label: string; fn: () => void }[] = [
    { icon: 'plus', label: 'Zoom in (+)', fn: () => graphRef.current?.zoomBy(1.25) },
    { icon: 'minus', label: 'Zoom out (−)', fn: () => graphRef.current?.zoomBy(0.8) },
    { icon: 'fit', label: 'Fit to screen (0)', fn: () => graphRef.current?.fit() },
  ];
  const moreActions: { icon: IconName; label: string; fn: () => void }[] = [
    { icon: 'shuffle', label: 'Re-arrange layout', fn: () => graphRef.current?.relayout() },
    { icon: 'download', label: 'Download as image', fn: downloadPng },
    ...(canFullscreen
      ? [
          {
            icon: (fullscreen ? 'shrink' : 'expand') as IconName,
            label: fullscreen ? 'Exit full screen' : 'Full screen',
            fn: () => void (fullscreen ? document.exitFullscreen() : shellRef.current?.requestFullscreen()),
          },
        ]
      : []),
  ];

  return (
    <div ref={shellRef} className={cn('flex flex-col bg-background', fullscreen ? 'h-dvh' : 'h-[calc(100dvh-3.5rem)]')}>
      {/* Book bar */}
      <div className="flex items-center gap-3 border-b border-border/60 px-3 py-2 sm:px-5">
        <Button asChild variant="ghost" size="icon-lg" className="hidden rounded-full sm:inline-flex">
          <Link to="/browse" aria-label="Back to browse">
            <Icon name="arrowLeft" />
          </Link>
        </Button>
        <Cover coverId={book.coverId} title={book.title} size="S" className="w-8 shrink-0" eager />
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-serif text-base leading-tight font-semibold sm:text-lg">{map.title}</h1>
          <p className="flex items-center gap-2 truncate text-xs text-muted-foreground">
            <span className="truncate">{map.authors.join(', ')}</span>
            <MapKindBadge kind={kind} className="hidden sm:inline-flex" />
          </p>
        </div>
        {progress !== undefined && spoilerAware && <SpoilerControl map={map} progress={progress} onChange={setProgress} />}
        {!spoilerAware && progress !== undefined && (
          <Badge variant="outline" className="h-8 rounded-full px-3 text-muted-foreground" title="This source has no chapter information">
            <Icon name="eye" size={14} /> Spoilers not filtered
          </Badge>
        )}
      </div>

      <div className="relative flex min-h-0 flex-1">
        {/* Canvas area */}
        <div className="relative min-w-0 flex-1 overflow-hidden">
          {progress === undefined ? (
            spoilerAware ? <SpoilerGate map={map} onChoose={setProgress} /> : <SpoilerWarning map={map} onAccept={() => setProgress('all')} />
          ) : (
            <>
              {mode === 'graph' ? (
                <GraphCanvas
                  ref={graphRef}
                  nodes={nodes}
                  edges={edges}
                  selection={selection}
                  dark={dark}
                  onSelect={select}
                  seed={map.workId}
                  ariaLabel={`Relationship graph of ${view.characters.length} characters in ${map.title}. Use the list view for an accessible version.`}
                />
              ) : (
                <ListView map={map} view={view} enabled={enabled} showMinor={showMinor} selectedId={selectedChar?.id} onSelect={selectCharacter} />
              )}

              {/* Top toolbar */}
              <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex items-start gap-2">
                <div className="pointer-events-auto relative w-full max-w-[16rem]">
                  <Icon name="search" size={15} className="pointer-events-none absolute top-1/2 left-3 z-10 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="character-search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && matches[0]) {
                        selectCharacter(matches[0].id);
                        setQuery('');
                      } else if (e.key === 'Escape') setQuery('');
                    }}
                    placeholder="Find a character"
                    aria-label="Find a character"
                    autoComplete="off"
                    className={cn('h-9 rounded-full pl-9', FLOATING)}
                  />
                  {query && (
                    <div className="absolute top-full right-0 left-0 mt-1.5 animate-in rounded-lg bg-popover p-1 text-popover-foreground shadow-lg ring-1 ring-foreground/10 duration-100 fade-in">
                      {matches.length === 0 && (
                        <p className="px-3 py-2 text-xs text-muted-foreground">
                          No one by that name yet{progress !== 'all' ? ' (spoiler shield is on)' : ''}.
                        </p>
                      )}
                      {matches.map((c) => (
                        <Button
                          key={c.id}
                          variant="ghost"
                          className="w-full justify-start"
                          onClick={() => {
                            selectCharacter(c.id);
                            setQuery('');
                          }}
                        >
                          <span className="size-2.5 rounded-full" style={{ background: groupColor(c.group, map.groups) }} />
                          {c.name}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>

                <Popover open={filtersOpen} onOpenChange={setFiltersOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="icon-lg" aria-label="Filters" className={cn('pointer-events-auto relative rounded-full lg:hidden', FLOATING)}>
                      <Icon name="filter" size={15} />
                      {(enabled.size < RELATION_TYPES.length || !showMinor) && <span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-primary" />}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-[min(20rem,calc(100vw-1.5rem))] p-4">
                    {filterControls}
                  </PopoverContent>
                </Popover>

                <ToggleGroup
                  type="single"
                  spacing={0}
                  value={mode}
                  onValueChange={(v) => v && setMode(v as 'graph' | 'list')}
                  className={cn('pointer-events-auto ml-auto rounded-full p-0.5', FLOATING)}
                >
                  {(['graph', 'list'] as const).map((m) => (
                    <ToggleGroupItem
                      key={m}
                      value={m}
                      aria-label={m === 'graph' ? 'Graph view' : 'List view'}
                      title={m === 'graph' ? 'Graph view' : 'List view'}
                      className="h-8 min-w-8 rounded-full! px-2.5 data-[state=on]:bg-foreground data-[state=on]:text-background"
                    >
                      <Icon name={m} size={15} />
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </div>

              {/* Legend (desktop) */}
              {mode === 'graph' && (
                <div className="pointer-events-none absolute bottom-3 left-3 z-10 hidden max-w-[calc(100%-5rem)] lg:block">
                  <div className={cn('pointer-events-auto flex flex-wrap items-center gap-0.5 rounded-2xl p-1', FLOATING)}>
                    <TypeFilters view={view} enabled={enabled} onToggle={toggleType} />
                    <Separator orientation="vertical" className="mx-1.5 h-5!" />
                    <Label htmlFor="show-minor-legend" className="cursor-pointer gap-2 pr-2 text-xs font-normal text-muted-foreground">
                      <Switch id="show-minor-legend" size="sm" checked={showMinor} onCheckedChange={setShowMinor} />
                      Minor
                    </Label>
                  </div>
                </div>
              )}

              {/* Zoom controls */}
              {mode === 'graph' && (
                <div className={cn('absolute right-3 bottom-3 z-10 flex flex-col items-center rounded-full p-1', FLOATING)}>
                  {zoomButtons.map((b) => (
                    <Tooltip key={b.label}>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon-lg" className="rounded-full" onClick={b.fn} aria-label={b.label}>
                          <Icon name={b.icon} size={16} />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="left">{b.label}</TooltipContent>
                    </Tooltip>
                  ))}
                  <Separator className="my-0.5 w-5!" />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-lg" className="rounded-full" aria-label="More graph actions">
                        <Icon name="more" size={16} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent side="left" align="end" className="w-48">
                      {moreActions.map((a) => (
                        <DropdownMenuItem key={a.label} onSelect={a.fn}>
                          <Icon name={a.icon} size={15} /> {a.label}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}

              {/* Empty filter state */}
              {mode === 'graph' && edges.length === 0 && nodes.length > 0 && enabled.size === 0 && (
                <div className="pointer-events-none absolute inset-x-0 top-16 z-10 flex justify-center">
                  <Badge variant="outline" className={cn('h-8 px-4 text-muted-foreground', FLOATING)}>
                    All relationship types are hidden.
                  </Badge>
                </div>
              )}

              {/* Mobile: open the details sheet */}
              {!sheetOpen && (
                <Button size="lg" className="absolute bottom-4 left-1/2 z-10 h-10 max-w-[60%] -translate-x-1/2 rounded-full px-5 shadow-lg lg:hidden" onClick={() => setSheetOpen(true)}>
                  <Icon name={selection ? 'users' : 'info'} size={16} />
                  <span className="truncate">{selectedChar ? selectedChar.name : selectedRel ? 'Relationship' : 'Cast & details'}</span>
                </Button>
              )}
            </>
          )}
        </div>

        {/* Desktop side panel */}
        {progress !== undefined && (
          <aside className="hidden w-[380px] shrink-0 border-l bg-card lg:block xl:w-[420px]" aria-label="Details">
            <ScrollArea className="h-full">
              <div className="p-5">
                {selection && (
                  <Button variant="ghost" size="sm" className="mb-3 -ml-2 text-muted-foreground" onClick={() => select(null)}>
                    <Icon name="arrowLeft" size={14} /> Overview
                  </Button>
                )}
                {panel}
              </div>
            </ScrollArea>
          </aside>
        )}

        {/* Mobile bottom sheet (non-modal so the graph stays interactive) */}
        {progress !== undefined && (
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen} modal={false}>
            <SheetContent
              side="bottom"
              className="max-h-[55dvh] gap-0 rounded-t-3xl lg:hidden"
              onOpenAutoFocus={(e) => e.preventDefault()}
              onInteractOutside={(e) => e.preventDefault()}
            >
              <SheetHeader className="flex-row items-center gap-1 px-5 pt-3 pb-2">
                <span className="absolute top-2 left-1/2 h-1.5 w-10 -translate-x-1/2 rounded-full bg-border" aria-hidden />
                {selection && (
                  <Button variant="ghost" size="icon-sm" aria-label="Back to overview" onClick={() => select(null)}>
                    <Icon name="arrowLeft" size={17} />
                  </Button>
                )}
                <SheetTitle className="sr-only">{selectedChar?.name ?? (selectedRel ? 'Relationship' : 'Cast & details')}</SheetTitle>
                <SheetDescription className="sr-only">Details for the selected item</SheetDescription>
              </SheetHeader>
              <div className="overflow-y-auto px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">{panel}</div>
            </SheetContent>
          </Sheet>
        )}
      </div>
    </div>
  );
}
