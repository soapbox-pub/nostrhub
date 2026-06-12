import { Fragment } from 'react';
import { Search } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/**
 * Shared building blocks for discovery/listing pages (NIPs, repos, …):
 * a search field, filter pills, and a responsive card grid that branches
 * between skeletons, a dashed empty state, and the rendered items.
 */

interface DiscoveryGridProps<T> {
  /** Items to render (already filtered). `undefined` while nothing has loaded. */
  items: T[] | undefined;
  isLoading: boolean;
  /** Stable React key for an item. */
  getKey: (item: T) => string;
  renderItem: (item: T) => React.ReactNode;
  /** Skeleton card shown `skeletonCount` times while loading. */
  renderSkeleton: (index: number) => React.ReactNode;
  skeletonCount?: number;
  /** Message (or richer node) for the dashed empty state. */
  empty: React.ReactNode;
  className?: string;
}

export function DiscoveryGrid<T>({
  items,
  isLoading,
  getKey,
  renderItem,
  renderSkeleton,
  skeletonCount = 6,
  empty,
  className,
}: DiscoveryGridProps<T>) {
  if (isLoading) {
    return (
      <div className={cn('grid gap-4 sm:grid-cols-2 lg:grid-cols-3', className)}>
        {Array.from({ length: skeletonCount }).map((_, i) => (
          <Fragment key={i}>{renderSkeleton(i)}</Fragment>
        ))}
      </div>
    );
  }

  if (!items || items.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="px-8 py-12 text-center">
          <p className="mx-auto max-w-sm text-muted-foreground">{empty}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={cn('grid gap-4 sm:grid-cols-2 lg:grid-cols-3', className)}>
      {items.map((item) => (
        <Fragment key={getKey(item)}>{renderItem(item)}</Fragment>
      ))}
    </div>
  );
}

interface DiscoverySearchProps extends Omit<React.ComponentProps<typeof Input>, 'type'> {
  /** Accessible label; also used as the placeholder unless one is given. */
  label: string;
}

/** Search input with a leading magnifier icon, used above discovery grids. */
export function DiscoverySearch({ label, className, placeholder, ...props }: DiscoverySearchProps) {
  return (
    <div className="relative max-w-md">
      <Search
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <Input
        type="search"
        aria-label={label}
        placeholder={placeholder ?? label}
        className={cn('pl-9', className)}
        {...props}
      />
    </div>
  );
}

interface FilterPillProps extends React.ComponentProps<'button'> {
  active?: boolean;
}

/** Toggleable filter pill rendered in the row above a discovery grid. */
export function FilterPill({ active = false, className, children, ...props }: FilterPillProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active
          ? 'border-primary/40 bg-gradient-to-r from-primary/15 to-nebula/15 text-foreground'
          : 'border-border/60 text-muted-foreground hover:border-primary/30 hover:text-foreground',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
