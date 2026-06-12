import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface KindBadgeProps {
  kind: string | number;
  className?: string;
}

/**
 * Clickable event-kind pill linking to the kind reference page (`/k/<kind>`),
 * which lists the NIPs and apps that reference the kind. Safe to nest inside
 * card-level links — clicks don't propagate to the parent.
 */
export function KindBadge({ kind, className }: KindBadgeProps) {
  return (
    <Badge
      asChild
      variant="outline"
      className={cn(
        'font-mono text-xs transition-colors hover:border-primary/60 hover:text-primary',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
    >
      <Link to={`/k/${kind}`} onClick={(e) => e.stopPropagation()}>
        kind {kind}
      </Link>
    </Badge>
  );
}

export default KindBadge;
