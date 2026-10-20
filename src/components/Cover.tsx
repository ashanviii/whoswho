import { useState } from 'react';
import { cn } from '@/lib/utils';
import { coverUrl } from '../lib/openLibrary';

const HUES = [350, 20, 40, 160, 200, 230, 270, 300];

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

interface Props {
  coverId?: number;
  title: string;
  author?: string;
  size?: 'S' | 'M' | 'L';
  className?: string;
  eager?: boolean;
}

/**
 * Book cover from Open Library. While loading it shows a quiet neutral
 * placeholder; books with no cover get a typographic fallback instead.
 */
export function Cover({ coverId, title, author, size = 'M', className, eager }: Props) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const src = coverUrl(coverId, size);
  const fallback = !src || failed;
  const hue = HUES[hash(title) % HUES.length];

  return (
    <div
      className={cn(
        'relative aspect-[2/3] overflow-hidden rounded-md bg-muted shadow-sm ring-1 ring-foreground/5',
        !fallback && !loaded && 'animate-pulse',
        className,
      )}
      style={fallback ? { background: `linear-gradient(160deg, hsl(${hue} 28% 46%), hsl(${hue + 20} 32% 30%))` } : undefined}
    >
      {fallback && (
        <div className="absolute inset-0 flex flex-col justify-between p-[8%] text-white [container-type:inline-size]">
          <span className="line-clamp-4 font-serif text-[clamp(0.6rem,12cqw,1rem)] leading-tight font-semibold">{title}</span>
          {author && <span className="line-clamp-2 text-[clamp(0.5rem,8cqw,0.75rem)] leading-tight opacity-80">{author}</span>}
        </div>
      )}
      {!fallback && (
        <img
          src={src}
          alt={`Cover of ${title}`}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          onLoad={(e) => {
            // Open Library serves a 1×1 placeholder for some missing covers.
            if ((e.currentTarget as HTMLImageElement).naturalWidth < 10) setFailed(true);
            else setLoaded(true);
          }}
          onError={() => setFailed(true)}
          className={cn(
            'absolute inset-0 h-full w-full object-cover transition-[opacity,scale] duration-700 ease-(--ease-out-soft)',
            loaded ? 'scale-100 opacity-100' : 'scale-105 opacity-0',
          )}
        />
      )}
    </div>
  );
}
