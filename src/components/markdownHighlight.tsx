import { useMemo, Fragment, type ReactNode } from 'react';
import {
  HighlightContext,
  findHighlightSpans,
  type HighlightContextValue,
} from '@/lib/highlightMatch';
import { useHighlightContext } from '@/hooks/useHighlightContext';

export function HighlightProvider({
  matchers,
  onActivate,
  activeId,
  children,
}: HighlightContextValue & { children: ReactNode }) {
  const value = useMemo(
    () => ({ matchers, onActivate, activeId }),
    [matchers, onActivate, activeId],
  );
  return <HighlightContext.Provider value={value}>{children}</HighlightContext.Provider>;
}

/**
 * Render a plain-text leaf, wrapping any community-highlighted ranges in
 * clickable <mark> elements when a highlight context is active. Falls back to
 * the raw string otherwise.
 */
export function MarkedText({ text }: { text: string }) {
  const ctx = useHighlightContext();
  const spans = useMemo(
    () => (ctx && ctx.matchers.length > 0 ? findHighlightSpans(text, ctx.matchers) : []),
    [ctx, text],
  );

  if (!ctx || spans.length === 0) return <>{text}</>;

  const nodes: ReactNode[] = [];
  let cursor = 0;
  let key = 0;

  for (const span of spans) {
    if (span.start > cursor) {
      nodes.push(<Fragment key={key++}>{text.slice(cursor, span.start)}</Fragment>);
    }
    const isActive = ctx.activeId
      ? span.highlights.some((h) => h.event.id === ctx.activeId)
      : false;
    const label =
      span.highlights.length > 1
        ? `${span.highlights.length} community highlights — click to read comments`
        : 'Community highlight — click to read the comment';
    nodes.push(
      <mark
        key={key++}
        role="button"
        tabIndex={0}
        aria-label={label}
        title={label}
        data-active={isActive || undefined}
        className={
          'cursor-pointer rounded-[3px] bg-primary/20 px-0.5 text-foreground ' +
          'underline decoration-primary/40 decoration-dotted underline-offset-2 ' +
          'transition-colors hover:bg-primary/35 focus-visible:outline-none ' +
          'focus-visible:ring-2 focus-visible:ring-primary/60 ' +
          'data-[active=true]:bg-primary/45 data-[active=true]:decoration-solid'
        }
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          ctx.onActivate(span.highlights);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            ctx.onActivate(span.highlights);
          }
        }}
      >
        {text.slice(span.start, span.end)}
      </mark>,
    );
    cursor = span.end;
  }

  if (cursor < text.length) {
    nodes.push(<Fragment key={key}>{text.slice(cursor)}</Fragment>);
  }

  return <>{nodes}</>;
}
