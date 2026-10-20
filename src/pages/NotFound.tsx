import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { EmptyState } from '../components/States';

export function NotFound() {
  return (
    <EmptyState
      icon="book"
      title="This page is missing from the shelf"
      action={
        <Button asChild size="lg" className="rounded-full px-4">
          <Link to="/">Back to the start</Link>
        </Button>
      }
    >
      The link may be broken, or the page may have moved.
    </EmptyState>
  );
}
