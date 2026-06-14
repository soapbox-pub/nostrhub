import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface TagBadgeProps {
  /** The hashtag value, without the leading `#`. */
  tag: string;
  /**
   * Which discovery page the tag filters. `repos` -> `/repos?tag=…`,
   * `apps` -> `/apps?tag=…`, `releases` -> `/releases?tag=…`.
   */
  to: 'repos' | 'apps' | 'releases';
  className?: string;
}

/**
 * A clickable topic/hashtag badge. Navigates to the matching discovery page
 * with the tag pre-applied as a filter (`?tag=<tag>`).
 */
export function TagBadge({ tag, to, className }: TagBadgeProps) {
  return (
    <Badge
      asChild
      variant="secondary"
      className={cn(
        'font-normal transition-colors hover:bg-secondary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
    >
      <Link to={`/${to}?tag=${encodeURIComponent(tag)}`}>#{tag}</Link>
    </Badge>
  );
}

export default TagBadge;
