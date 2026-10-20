import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Icon } from './Icon';

export function MapBadge({ mapped, className }: { mapped: boolean; className?: string }) {
  return mapped ? (
    <Badge className={cn('border-transparent bg-success-soft font-semibold text-success', className)} title="This book has a curated character relationship map">
      <Icon name="graph" size={12} strokeWidth={2.4} />
      Character map
    </Badge>
  ) : (
    <Badge variant="secondary" className={cn('text-muted-foreground', className)} title="Only bibliographic metadata is available for this book">
      Metadata only
    </Badge>
  );
}

export function ReviewBadge({ status }: { status: 'reviewed' | 'unreviewed' }) {
  return status === 'reviewed' ? (
    <Badge variant="outline" className="border-success/30 text-success">
      <Icon name="check" size={12} strokeWidth={2.6} /> Human-reviewed
    </Badge>
  ) : (
    <Badge variant="outline" className="text-muted-foreground" title="Curated from the text but not yet checked line-by-line by a second reviewer">
      Awaiting review
    </Badge>
  );
}
