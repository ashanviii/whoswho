import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Separator } from '@/components/ui/separator';
import { Toggle } from '@/components/ui/toggle';
import { cn } from '@/lib/utils';
import { REL_TYPES, ROLE_LABEL, groupColor, relColor } from '../../lib/relTypes';
import { sectionById, sectionName } from '../../lib/sections';
import { otherEnd, roleOfOther, type SpoilerView, type VisibleCharacter, type VisibleRelationship } from '../../lib/spoilers';
import { useIsDark } from '../../lib/theme';
import { RELATION_TYPES, type CharacterMap, type MapKind, type RelationType } from '../../types/map';
import { ReviewBadge } from '../Badges';
import { Icon } from '../Icon';

const ROLE_ORDER = ['protagonist', 'major', 'supporting', 'minor'];

const KIND_META: Record<MapKind, { label: string; title: string }> = {
  curated: { label: 'Curated', title: 'Written by people from the text, with chapter-level spoiler data' },
  'auto-text': { label: 'Auto-generated', title: 'Detected automatically from the full public-domain text' },
  wikidata: { label: 'From Wikidata', title: 'Imported from Wikidata statements; not spoiler-safe' },
};

/** Small label saying where a map comes from (shown for non-curated maps). */
export function MapKindBadge({ kind, className }: { kind: MapKind; className?: string }) {
  if (kind === 'curated') return null;
  return (
    <Badge variant="outline" className={cn('h-4.5 px-1.5 text-[10px] text-muted-foreground', className)} title={KIND_META[kind].title}>
      {KIND_META[kind].label}
    </Badge>
  );
}

function Dot({ color, size = 10 }: { color: string; size?: number }) {
  return <span className="inline-block shrink-0 rounded-full" style={{ background: color, width: size, height: size }} />;
}

function SectionTag({ map, id }: { map: CharacterMap; id: string }) {
  const s = sectionById(map, id);
  return (
    <Badge variant="secondary" className="h-4.5 rounded-md px-1.5 text-[10px] font-semibold text-muted-foreground tabular-nums">
      {s?.label}
    </Badge>
  );
}

function Heading({ children }: { children: ReactNode }) {
  return <h3 className="mb-2.5 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{children}</h3>;
}

function HiddenNote({ children }: { children: ReactNode }) {
  return (
    <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
      <Icon name="shield" size={13} /> {children}
    </p>
  );
}

/* ───────────── Character profile ───────────── */

export function CharacterPanel({
  map,
  view,
  character,
  onSelectCharacter,
  onSelectRelationship,
}: {
  map: CharacterMap;
  view: SpoilerView;
  character: VisibleCharacter;
  onSelectCharacter(id: string): void;
  onSelectRelationship(id: string): void;
}) {
  const dark = useIsDark();
  const byId = useMemo(() => new Map(view.characters.map((c) => [c.id, c])), [view]);
  const rels = view.relationships.filter((r) => r.source === character.id || r.target === character.id);
  const totalRels = map.relationships.filter((r) => r.source === character.id || r.target === character.id).length;
  const hiddenRels = totalRels - rels.length;
  const group = map.groups?.find((g) => g.id === character.group);
  const grouped = RELATION_TYPES.map((t) => ({ type: t, items: rels.filter((r) => r.current.type === t) })).filter((g) => g.items.length);

  return (
    <div className="animate-in space-y-6 duration-300 fade-in slide-in-from-bottom-1" key={character.id}>
      <div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className="gap-1.5 text-muted-foreground">
            <Dot color={groupColor(character.group, map.groups)} size={8} />
            {group?.label ?? 'Ungrouped'}
          </Badge>
          <Badge variant={character.role === 'protagonist' ? 'default' : 'secondary'}>{ROLE_LABEL[character.role]}</Badge>
        </div>
        <h2 className="mt-2.5 font-serif text-2xl leading-tight font-semibold">{character.name}</h2>
        {character.aliases?.length ? <p className="mt-1 text-xs text-muted-foreground">Also: {character.aliases.join(', ')}</p> : null}
        <p className="mt-3 text-[15px] leading-relaxed">{character.summary}</p>
        {character.summarySource && (
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            From{' '}
            <a href={character.summarySource.url} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-foreground">
              {character.summarySource.name}
            </a>{' '}
            · {character.summarySource.license}
          </p>
        )}
        {map.sections.length > 1 && (
          <p className="mt-2 text-xs text-muted-foreground">First appears in {sectionName(sectionById(map, character.firstAppearance))}</p>
        )}
      </div>

      {(character.visibleNotes.length > 0 || character.hiddenNoteCount > 0) && (
        <section>
          <Heading>Story so far</Heading>
          <ol className="relative space-y-3 border-l pl-4">
            {character.visibleNotes.map((n, i) => (
              <li key={i} className="reveal relative text-sm leading-relaxed" style={{ '--i': i + 1 } as CSSProperties}>
                <span className="absolute top-1.5 -left-[21px] size-2.5 rounded-full border-2 border-card bg-primary" />
                <SectionTag map={map} id={n.at} /> <span className="ml-1">{n.text}</span>
              </li>
            ))}
          </ol>
          {character.hiddenNoteCount > 0 && (
            <HiddenNote>
              {character.hiddenNoteCount} later development{character.hiddenNoteCount > 1 ? 's' : ''} hidden
            </HiddenNote>
          )}
        </section>
      )}

      <Separator />

      <section>
        <Heading>Connections ({rels.length})</Heading>
        {rels.length === 0 && <p className="text-sm text-muted-foreground">No connections revealed yet.</p>}
        <div className="space-y-4">
          {grouped.map(({ type, items }) => (
            <div key={type}>
              <div className="mb-1 flex items-center gap-2 text-xs font-medium" style={{ color: relColor(type, dark) }}>
                <span className="h-0.5 w-4 rounded" style={{ background: relColor(type, dark) }} />
                {REL_TYPES[type].label}
              </div>
              <ul className="-mx-2 space-y-0.5">
                {items.map((r, idx) => {
                  const other = byId.get(otherEnd(r, character.id));
                  if (!other) return null;
                  return (
                    <li key={r.id} className="reveal flex items-start gap-3 rounded-lg p-2 transition-colors hover:bg-muted" style={{ '--i': idx + 2 } as CSSProperties}>
                      <span className="mt-1.5">
                        <Dot color={groupColor(other.group, map.groups)} size={10} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-x-2">
                          <Button variant="link" className="h-auto p-0 text-sm font-semibold text-foreground" onClick={() => onSelectCharacter(other.id)}>
                            {other.name}
                          </Button>
                          <span className="text-xs text-muted-foreground">{roleOfOther(r, character.id)}</span>
                        </div>
                        <button onClick={() => onSelectRelationship(r.id)} className="block text-left text-xs text-muted-foreground hover:text-foreground">
                          {r.current.label}
                          {r.current.note ? ` — ${r.current.note}` : ''}
                          {r.history.length > 1 && <span className="ml-1 font-medium text-primary">· {r.history.length} stages</span>}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
        {hiddenRels > 0 && (
          <HiddenNote>
            {hiddenRels} connection{hiddenRels > 1 ? 's' : ''} not revealed yet
          </HiddenNote>
        )}
      </section>
    </div>
  );
}

/* ───────────── Relationship detail ───────────── */

export function RelationshipPanel({
  map,
  view,
  rel,
  onSelectCharacter,
}: {
  map: CharacterMap;
  view: SpoilerView;
  rel: VisibleRelationship;
  onSelectCharacter(id: string): void;
}) {
  const dark = useIsDark();
  const a = view.characters.find((c) => c.id === rel.source);
  const b = view.characters.find((c) => c.id === rel.target);
  if (!a || !b) return null;
  const color = relColor(rel.current.type, dark);
  const person = (c: VisibleCharacter, role?: string) => (
    <button onClick={() => onSelectCharacter(c.id)} className="min-w-0 flex-1 text-left">
      <Card size="sm" className="gap-0.5 px-3 transition-colors hover:bg-muted">
        <div className="flex items-center gap-2">
          <Dot color={groupColor(c.group, map.groups)} />
          <span className="truncate text-sm font-semibold">{c.name}</span>
        </div>
        {role && <div className="truncate pl-[18px] text-xs text-muted-foreground">{role}</div>}
      </Card>
    </button>
  );

  return (
    <div className="animate-in space-y-6 duration-300 fade-in slide-in-from-bottom-1" key={rel.id}>
      <div>
        <Badge variant="outline" className="gap-1.5" style={{ color, borderColor: color }}>
          <span className="h-0.5 w-3.5 rounded" style={{ background: color }} />
          {REL_TYPES[rel.current.type].label}
        </Badge>
        <h2 className="mt-2.5 font-serif text-2xl leading-tight font-semibold">{rel.current.label}</h2>
      </div>
      <div className="flex items-stretch gap-2">
        {person(a, rel.current.sourceRole)}
        {person(b, rel.current.targetRole)}
      </div>
      <section>
        <Heading>How it develops</Heading>
        <ol className="relative space-y-4 border-l pl-4">
          {rel.history.map((p, i) => (
            <li key={i} className="reveal relative" style={{ '--i': i + 1 } as CSSProperties}>
              <span className="absolute top-1 -left-[21px] size-2.5 rounded-full border-2 border-card" style={{ background: relColor(p.type, dark) }} />
              <div className="flex flex-wrap items-center gap-2">
                <SectionTag map={map} id={p.at} />
                <span className="text-sm font-semibold">{p.label}</span>
                <span className="text-xs text-muted-foreground">{REL_TYPES[p.type].label}</span>
              </div>
              {p.note && <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{p.note}</p>}
            </li>
          ))}
        </ol>
        {rel.hiddenPhaseCount > 0 && (
          <HiddenNote>
            {rel.hiddenPhaseCount} later change{rel.hiddenPhaseCount > 1 ? 's' : ''} hidden by the spoiler shield
          </HiddenNote>
        )}
      </section>
    </div>
  );
}

/* ───────────── Overview (nothing selected) ───────────── */

export function OverviewPanel({
  map,
  view,
  description,
  onSelectCharacter,
}: {
  map: CharacterMap;
  view: SpoilerView;
  description?: string;
  onSelectCharacter(id: string): void;
}) {
  const [more, setMore] = useState(false);
  const groups = [...(map.groups ?? []), { id: '', label: 'Others' }]
    .map((g) => ({
      ...g,
      members: view.characters.filter((c) => (c.group ?? '') === g.id).sort((x, y) => ROLE_ORDER.indexOf(x.role) - ROLE_ORDER.indexOf(y.role)),
    }))
    .filter((g) => g.members.length);

  const hidden = view.hiddenCharacterCount + view.hiddenRelationshipCount;

  return (
    <div className="space-y-7">
      <div>
        <p className="text-sm text-muted-foreground">
          <span key={view.characters.length} className="tick font-medium text-foreground tabular-nums">
            {view.characters.length}
          </span>{' '}
          characters ·{' '}
          <span key={view.relationships.length} className="tick font-medium text-foreground tabular-nums">
            {view.relationships.length}
          </span>{' '}
          relationships
          {map.sections.length > 1 && (
            <>
              {' '}
              · <span className="tabular-nums">{map.sections.length}</span> {map.sectionLabel.plural.toLowerCase()}
            </>
          )}
        </p>
        {hidden > 0 && (
          <p className="mt-1.5 flex items-center gap-1.5 text-xs text-primary">
            <Icon name="shield" size={13} />
            {view.hiddenCharacterCount} characters and {view.hiddenRelationshipCount} relationships still hidden
          </p>
        )}
        {map.provenance.kind === 'auto-text' && (
          <p className="mt-4 rounded-lg bg-muted/60 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">Generated automatically from the full text.</span> Lines show who is named together,
            and grow stronger as they share more passages — the kind of relationship isn’t guessed. Expect the odd duplicate or missing nickname.
          </p>
        )}
        {map.provenance.kind === 'wikidata' && (
          <p className="mt-4 rounded-lg bg-muted/60 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">From Wikidata,</span> the volunteer-edited knowledge base. Relationships are real
            statements but may describe the end of the story, and coverage depends on what has been entered.
          </p>
        )}
        <p className="mt-4 text-sm text-muted-foreground">Select someone on the graph, or pick from the cast.</p>
      </div>

      <section>
        <Heading>Cast</Heading>
        <div className="space-y-4">
          {groups.map((g) => (
            <div key={g.id || 'none'}>
              <div className="mb-1.5 flex items-center gap-2 text-xs text-muted-foreground">
                <Dot color={groupColor(g.id || undefined, map.groups)} size={8} />
                {g.label}
              </div>
              <div className="flex flex-wrap gap-1">
                {g.members.map((c, ci) => (
                  <button
                    key={c.id}
                    onClick={() => onSelectCharacter(c.id)}
                    style={{ animationDelay: `${Math.min(ci, 10) * 25}ms` }}
                    className={cn(
                      'pop rounded-full bg-muted px-2.5 py-1 text-xs transition-[color,background-color,scale] hover:bg-primary-soft hover:text-primary active:scale-95',
                      c.role === 'protagonist' && 'font-semibold',
                    )}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {description && (
        <section>
          <Heading>About the book</Heading>
          <p className={cn('text-sm leading-relaxed whitespace-pre-line text-muted-foreground', !more && 'line-clamp-5')}>{description}</p>
          {description.length > 320 && (
            <Button variant="link" size="sm" className="h-auto px-0" onClick={() => setMore((m) => !m)}>
              {more ? 'Show less' : 'Read more'}
            </Button>
          )}
          <p className="mt-1 text-[11px] text-muted-foreground">Description: Open Library. May contain spoilers.</p>
        </section>
      )}

      <MapProvenance map={map} />
    </div>
  );
}

export function MapProvenance({ map }: { map: CharacterMap }) {
  const p = map.provenance;
  return (
    <Collapsible className="group/prov rounded-xl border text-xs">
      <CollapsibleTrigger asChild>
        <button className="flex w-full items-center justify-between gap-2 p-3 text-left font-medium">
          <span>About this map</span>
          <span className="flex items-center gap-2">
            {(p.kind ?? 'curated') === 'curated' ? <ReviewBadge status={p.review.status} /> : <MapKindBadge kind={p.kind!} />}
            <Icon name="chevronDown" size={14} className="transition-transform group-data-[state=open]/prov:rotate-180" />
          </span>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <dl className="space-y-2 px-3 pb-3 leading-relaxed text-muted-foreground">
          <div>
            <dt className="font-semibold text-foreground">Edition followed</dt>
            <dd>
              {map.edition.description}{' '}
              {map.edition.url ? (
                <a className="underline" href={map.edition.url} target="_blank" rel="noreferrer">
                  {map.edition.source ?? 'Source'}
                </a>
              ) : (
                map.edition.source
              )}
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-foreground">Method</dt>
            <dd>{p.method}</dd>
          </div>
          <div>
            <dt className="font-semibold text-foreground">Review</dt>
            <dd>
              {p.review.status === 'reviewed'
                ? `Reviewed by ${p.review.reviewedBy?.join(', ')}${p.review.reviewedAt ? ` on ${p.review.reviewedAt}` : ''}.`
                : 'Not yet independently reviewed.'}{' '}
              {p.review.notes}
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-foreground">Updated · License</dt>
            <dd>
              {p.updatedAt} · {map.license}
            </dd>
          </div>
        </dl>
      </CollapsibleContent>
    </Collapsible>
  );
}

/* ───────────── Filters & legend ───────────── */

export function TypeFilters({ view, enabled, onToggle }: { view: SpoilerView; enabled: Set<RelationType>; onToggle(t: RelationType): void }) {
  const dark = useIsDark();
  const counts = new Map<RelationType, number>();
  for (const r of view.relationships) counts.set(r.current.type, (counts.get(r.current.type) ?? 0) + 1);
  return (
    <div className="flex flex-wrap gap-1.5">
      {RELATION_TYPES.filter((t) => counts.get(t)).map((t) => {
        const on = enabled.has(t);
        const color = relColor(t, dark);
        return (
          <Toggle
            key={t}
            size="sm"
            pressed={on}
            onPressedChange={() => onToggle(t)}
            title={`${on ? 'Hide' : 'Show'} ${REL_TYPES[t].label.toLowerCase()} — ${REL_TYPES[t].description.toLowerCase()}`}
            className={cn(
              'h-7 gap-1.5 rounded-full px-2.5 text-xs font-normal hover:bg-muted data-[state=on]:bg-transparent data-[state=on]:hover:bg-muted',
              !on && 'opacity-40',
            )}
          >
            <span
              className="h-[3px] rounded-full transition-[width] duration-300 ease-(--ease-out-soft)"
              style={{ background: color, width: on ? 12 : 4 }}
            />
            {REL_TYPES[t].label}
          </Toggle>
        );
      })}
    </div>
  );
}

/* ───────────── Accessible list view ───────────── */

export function ListView({
  map,
  view,
  enabled,
  showMinor,
  selectedId,
  onSelect,
}: {
  map: CharacterMap;
  view: SpoilerView;
  enabled: Set<RelationType>;
  showMinor: boolean;
  selectedId?: string;
  onSelect(id: string): void;
}) {
  const chars = view.characters
    .filter((c) => showMinor || c.role !== 'minor')
    .sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) || b.degree - a.degree);
  const byId = new Map(view.characters.map((c) => [c.id, c]));

  return (
    <div className="absolute inset-0 overflow-y-auto">
      <ul className="mx-auto max-w-3xl divide-y px-4 pt-16 pb-28">
        {chars.map((c, ci) => {
          const rels = view.relationships.filter((r) => (r.source === c.id || r.target === c.id) && enabled.has(r.current.type));
          return (
            <li key={c.id} className="reveal" style={{ '--i': ci } as CSSProperties}>
              <button
                onClick={() => onSelect(c.id)}
                className={cn('flex w-full items-start gap-3 rounded-lg px-3 py-3.5 text-left hover:bg-muted', selectedId === c.id && 'bg-muted')}
              >
                <span className="mt-1.5">
                  <Dot color={groupColor(c.group, map.groups)} size={12} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-semibold">{c.name}</span>
                    <span className="text-xs text-muted-foreground">{ROLE_LABEL[c.role]}</span>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{c.summary}</p>
                  {rels.length > 0 && (
                    <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">
                      {rels
                        .map((r) => {
                          const o = byId.get(otherEnd(r, c.id));
                          return o ? `${o.name} (${roleOfOther(r, c.id)})` : null;
                        })
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  )}
                </div>
                <Badge variant="secondary" className="tabular-nums">
                  {rels.length}
                </Badge>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
