import { useMemo, useRef, useState } from 'react';
import { MarkdownContent } from '@/components/MarkdownContent';
import { HighlightProvider } from '@/components/markdownHighlight';
import { normalizeText, type HighlightMatcher } from '@/lib/highlightMatch';
import { HighlightSelectionPopover } from '@/components/HighlightSelectionPopover';
import { HighlightCommentsDialog } from '@/components/HighlightCommentsDialog';
import { useHighlights } from '@/hooks/useHighlights';
import type { HighlightSource, ParsedHighlight } from '@/lib/highlightSource';

interface HighlightableMarkdownProps {
  content: string;
  className?: string;
  /** The content this prose belongs to; enables highlight create + display. */
  source: HighlightSource | undefined;
}

/**
 * Renders Markdown prose with community NIP-84 highlights overlaid: existing
 * highlights are marked inline (click to read the author's comment), and
 * selecting text surfaces a floating button to create a new highlight.
 */
export function HighlightableMarkdown({ content, className, source }: HighlightableMarkdownProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { data: highlights } = useHighlights(source);
  const [active, setActive] = useState<ParsedHighlight[] | null>(null);
  const [hoveredIds, setHoveredIds] = useState<string[] | null>(null);

  const matchers = useMemo<HighlightMatcher[]>(() => {
    if (!highlights) return [];
    return highlights
      .map((h) => ({ needle: normalizeText(h.text), highlight: h }))
      .filter((m) => m.needle.length > 0);
  }, [highlights]);

  const activeId = active && active.length === 1 ? active[0].event.id : undefined;

  return (
    <div ref={containerRef} className="relative">
      <HighlightProvider
        matchers={matchers}
        onActivate={setActive}
        activeId={activeId}
        onHover={setHoveredIds}
        hoveredIds={hoveredIds ?? undefined}
      >
        <MarkdownContent content={content} className={className} />
      </HighlightProvider>

      <HighlightSelectionPopover containerRef={containerRef} source={source} />
      <HighlightCommentsDialog highlights={active} onClose={() => setActive(null)} />
    </div>
  );
}

export default HighlightableMarkdown;
