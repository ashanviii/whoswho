import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverDescription, PopoverTitle, PopoverTrigger } from '@/components/ui/popover';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import { sectionName } from '../../lib/sections';
import type { CharacterMap } from '../../types/map';
import { Icon } from '../Icon';

export type Progress = number | 'all';

export function progressIndex(p: Progress): number {
  return p === 'all' ? Number.POSITIVE_INFINITY : p;
}

export function progressLabel(map: CharacterMap, p: Progress): string {
  if (p === 'all') return 'Everything';
  const s = map.sections[p];
  return s ? `Up to ${sectionName(s)}` : 'Everything';
}

/** Slider + step buttons for choosing how far the reader has got. */
export function ProgressPicker({ map, value, onChange }: { map: CharacterMap; value: number; onChange(i: number): void }) {
  const max = map.sections.length - 1;
  const s = map.sections[value];
  return (
    <div>
      <div className="mb-4 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">I’ve read up to</div>
          <div className="truncate font-serif text-xl font-semibold">
            <span key={s.id} className="tick">
              {sectionName(s)}
            </span>
            {s.title && <span className="ml-2 text-base font-normal text-muted-foreground">{s.title}</span>}
          </div>
          {s.part && <div className="text-xs text-muted-foreground">{s.part}</div>}
        </div>
        <div className="flex shrink-0 gap-1">
          <Button variant="outline" size="icon-lg" className="rounded-full" aria-label="Previous section" disabled={value <= 0} onClick={() => onChange(value - 1)}>
            <Icon name="minus" size={16} />
          </Button>
          <Button variant="outline" size="icon-lg" className="rounded-full" aria-label="Next section" disabled={value >= max} onClick={() => onChange(value + 1)}>
            <Icon name="plus" size={16} />
          </Button>
        </div>
      </div>
      <Slider
        min={0}
        max={max}
        step={1}
        value={[value]}
        onValueChange={([v]) => onChange(v)}
        aria-label={`Reading progress, ${map.sectionLabel.plural.toLowerCase()}`}
        aria-valuetext={`${s.label}${s.part ? `, ${s.part}` : ''}`}
        className="py-2 [&_[data-slot=slider-thumb]]:size-4 [&_[data-slot=slider-thumb]]:border-2 [&_[data-slot=slider-thumb]]:border-primary [&_[data-slot=slider-track]]:h-1.5"
      />
      <div className="mt-1.5 flex justify-between text-[11px] text-muted-foreground">
        <span>{map.sections[0].label}</span>
        <span>
          {map.sections.length} {map.sectionLabel.plural.toLowerCase()}
        </span>
        <span>{map.sections[max].label}</span>
      </div>
    </div>
  );
}

/** Header button + popover for the spoiler shield. */
export function SpoilerControl({ map, progress, onChange }: { map: CharacterMap; progress: Progress; onChange(p: Progress): void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(0);
  const shielded = progress !== 'all';

  // Brief glow on the trigger whenever the reader's progress changes.
  const [flash, setFlash] = useState(false);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 800);
    return () => clearTimeout(t);
  }, [progress]);

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        if (o) setDraft(progress === 'all' ? map.sections.length - 1 : progress);
        setOpen(o);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="lg"
          className={cn(
            'rounded-full px-3.5',
            flash && 'halo',
            shielded && 'border-primary/40 bg-primary-soft text-primary hover:bg-primary-soft hover:text-primary dark:bg-primary-soft dark:hover:bg-primary-soft',
          )}
        >
          <span key={shielded ? 'shield' : 'eye'} className="pop inline-flex">
            <Icon name={shielded ? 'shield' : 'eye'} size={15} />
          </span>
          <span className="hidden sm:inline">{shielded ? 'Spoiler shield:' : 'Spoilers:'}</span>
          <span key={String(progress)} className="tick font-semibold">
            {shielded ? progressLabel(map, progress).replace('Up to ', '') : 'All shown'}
          </span>
          <Icon name="chevronDown" size={14} />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(24rem,calc(100vw-1.5rem))] gap-4 p-5">
        <PopoverTitle className="sr-only">Spoiler shield</PopoverTitle>
        <PopoverDescription className="sr-only">Choose how far you have read</PopoverDescription>
        <ProgressPicker map={map} value={draft} onChange={setDraft} />
        <p className="text-xs leading-relaxed text-muted-foreground">
          Characters, relationships and plot notes after this point are hidden. Your progress is saved on this device only.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            size="lg"
            className="flex-1 rounded-full"
            onClick={() => {
              onChange(draft);
              setOpen(false);
            }}
          >
            Apply
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="flex-1 rounded-full"
            onClick={() => {
              onChange('all');
              setOpen(false);
            }}
          >
            <Icon name="eye" size={15} /> Show everything
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** For sources without chapter data (Wikidata): warn once before showing anything. */
export function SpoilerWarning({ map, onAccept }: { map: CharacterMap; onAccept(): void }) {
  const navigate = useNavigate();
  // Go back within the app if we came from it; otherwise (opened from a link) go to Browse rather than leaving the site.
  const goBack = () => ((window.history.state?.idx ?? 0) > 0 ? navigate(-1) : navigate('/browse'));
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center overflow-y-auto bg-background p-4">
      <Card className="w-full max-w-md animate-in shadow-xl duration-300 fade-in zoom-in-95 [--card-spacing:--spacing(6)]">
        <CardHeader>
          <div className="mb-3 flex size-11 items-center justify-center rounded-full bg-primary-soft text-primary">
            <Icon name="eye" size={22} />
          </div>
          <CardTitle className="text-2xl font-semibold">This map may contain spoilers</CardTitle>
          <CardDescription className="leading-relaxed">
            The characters and relationships for <em>{map.title}</em> come from Wikidata, which doesn’t record when things happen in the story. Marriages,
            deaths and betrayals from the ending may be shown.
          </CardDescription>
        </CardHeader>
        <CardFooter className="flex-col gap-2 border-t-0 bg-transparent sm:flex-row">
          <Button size="lg" className="w-full rounded-full sm:flex-1" onClick={onAccept}>
            <Icon name="eye" size={15} /> Show the map
          </Button>
          <Button variant="outline" size="lg" className="w-full rounded-full sm:flex-1" onClick={goBack}>
            Go back
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

/** First-visit prompt shown instead of the graph, so nothing is spoiled before the reader chooses. */
export function SpoilerGate({ map, onChoose }: { map: CharacterMap; onChoose(p: Progress): void }) {
  const [value, setValue] = useState(0);
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center overflow-y-auto bg-background p-4">
      <Card className="w-full max-w-md animate-in shadow-xl duration-300 fade-in zoom-in-95 [--card-spacing:--spacing(6)]">
        <CardHeader>
          <div className="mb-3 flex size-11 items-center justify-center rounded-full bg-primary-soft text-primary">
            <Icon name="shield" size={22} />
          </div>
          <CardTitle className="text-2xl font-semibold">How far have you read?</CardTitle>
          <CardDescription className="leading-relaxed">
            We’ll only show characters and relationships you’ve already met in <em>{map.title}</em>. You can change this any time.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProgressPicker map={map} value={value} onChange={setValue} />
        </CardContent>
        <CardFooter className="flex-col gap-2 border-t-0 bg-transparent sm:flex-row">
          <Button size="lg" className="w-full rounded-full sm:flex-1" onClick={() => onChoose(value)}>
            <Icon name="shield" size={15} /> Explore safely
          </Button>
          <Button variant="outline" size="lg" className="w-full rounded-full sm:flex-1" onClick={() => onChoose('all')}>
            I’ve finished it
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
