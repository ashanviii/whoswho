import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { Icon, type IconName } from './Icon';

export function Spinner({ label = 'Loading…', className }: { label?: string; className?: string }) {
  return (
    <div role="status" className={cn('flex items-center justify-center gap-3 text-sm text-muted-foreground', className)}>
      <Icon name="loader" size={20} className="animate-spin text-primary" />
      {label}
    </div>
  );
}

export function EmptyState({
  icon = 'search',
  title,
  children,
  action,
}: {
  icon?: IconName;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mx-auto flex max-w-md animate-in flex-col items-center px-6 py-14 text-center duration-300 fade-in slide-in-from-bottom-2">
      <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon name={icon} size={22} />
      </div>
      <h3 className="font-serif text-lg font-semibold">{title}</h3>
      {children && <div className="mt-2 text-sm leading-relaxed text-muted-foreground">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry, title = 'Something went wrong' }: { error?: Error; onRetry?: () => void; title?: string }) {
  return (
    <div role="alert" className="mx-auto flex max-w-md animate-in flex-col items-center px-6 py-14 text-center duration-300 fade-in">
      <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-primary-soft text-primary">
        <Icon name="alert" size={22} />
      </div>
      <h3 className="font-serif text-lg font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{error?.message ?? 'Please try again.'}</p>
      {onRetry && (
        <Button variant="outline" size="lg" className="mt-5 rounded-full px-4" onClick={onRetry}>
          <Icon name="refresh" size={16} /> Try again
        </Button>
      )}
    </div>
  );
}

export function BookGridSkeleton({ count = 12 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <div key={i}>
          <Skeleton className="aspect-[2/3]" />
          <Skeleton className="mt-3 h-3.5 w-4/5" />
          <Skeleton className="mt-2 h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}
