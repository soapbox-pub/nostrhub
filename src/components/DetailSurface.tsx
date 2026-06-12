import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Opaque reading surface for detail pages.
 *
 * The site paints a detailed photo on a fixed, negative-z `body` pseudo-element
 * (see `index.css`), so any content without its own opaque background bleeds
 * through and becomes illegible. List/discovery pages stay readable because
 * every item is a `Card` (opaque `bg-card`). Detail pages render long-form prose
 * and free-form sections that aren't carded, so they need this panel to provide
 * the same opaque surface — one continuous "page" that the hero, body, and
 * discussion sit on, instead of the photo.
 */
export function DetailSurface({
  children,
  className,
  as: Component = 'div',
}: {
  children: ReactNode;
  className?: string;
  /** Element to render as (e.g. `section` for the discussion block). Defaults to `div`. */
  as?: 'div' | 'section' | 'article';
}) {
  return (
    <Component
      className={cn(
        'rounded-2xl border bg-card text-card-foreground shadow-sm',
        'p-6 sm:p-8',
        className,
      )}
    >
      {children}
    </Component>
  );
}

export default DetailSurface;
