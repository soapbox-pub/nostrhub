import { useMemo, Fragment, isValidElement, cloneElement, type ReactNode, type ReactElement } from 'react';
import {
  HighlightContext,
  findHighlightSpans,
  type HighlightContextValue,
  type HighlightSpan,
} from '@/lib/highlightMatch';
import { useHighlightContext } from '@/hooks/useHighlightContext';
import type { ParsedHighlight } from '@/lib/highlightSource';

export function HighlightProvider({
  matchers,
  onActivate,
  activeId,
  onHover,
  hoveredIds,
  children,
}: HighlightContextValue & { children: ReactNode }) {
  const value = useMemo(
    () => ({ matchers, onActivate, activeId, onHover, hoveredIds }),
    [matchers, onActivate, activeId, onHover, hoveredIds],
  );
  return <HighlightContext.Provider value={value}>{children}</HighlightContext.Provider>;
}

/**
 * Collect the plain text of a React node tree using the SAME normalization
 * (whitespace-collapse) that the matcher uses, so offsets line up. Returns the
 * concatenated normalized text. We track normalization statefully via `state`
 * so collapsing works across sibling/child boundaries.
 */

interface MarkState {
  /** Offset into the normalized block text consumed so far. */
  pos: number;
  /** Whether the previous emitted normalized char was a space (for collapsing). */
  prevSpace: boolean;
}

/**
 * Normalize a raw text chunk the same way {@link findHighlightSpans} does, given
 * the running `prevSpace` state. Returns the normalized chunk plus, for each
 * normalized character, the index into the ORIGINAL chunk it came from.
 */
function normalizeChunk(
  raw: string,
  prevSpace: boolean,
): { norm: string; origIndex: number[]; prevSpace: boolean } {
  const chars: string[] = [];
  const origIndex: number[] = [];
  let ps = prevSpace;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (/\s/.test(ch)) {
      if (ps) continue;
      chars.push(' ');
      origIndex.push(i);
      ps = true;
    } else {
      chars.push(ch.toLowerCase());
      origIndex.push(i);
      ps = false;
    }
  }
  return { norm: chars.join(''), origIndex, prevSpace: ps };
}

/**
 * Wrap the matched ranges of a single raw text leaf in <mark> elements. `spans`
 * are expressed in NORMALIZED block coordinates; `state.pos` is the normalized
 * offset at the start of this leaf. Advances `state` past this leaf.
 */
function markTextLeaf(
  raw: string,
  spans: HighlightSpan[],
  state: MarkState,
  ctx: HighlightContextValue,
  keyer: () => number,
): ReactNode {
  const { norm, origIndex, prevSpace } = normalizeChunk(raw, state.prevSpace);
  const leafStart = state.pos;
  const leafEnd = state.pos + norm.length;

  // Advance running state regardless of whether anything matched here.
  state.pos = leafEnd;
  state.prevSpace = prevSpace;

  if (norm.length === 0) return raw;

  // Spans (in normalized coords) that overlap this leaf.
  const overlapping = spans.filter((s) => s.start < leafEnd && s.end > leafStart);
  if (overlapping.length === 0) return raw;

  // Map a normalized block offset to a raw index within this leaf.
  // `local` is the normalized offset relative to the leaf start.
  const rawStartOf = (normPos: number): number => {
    const local = normPos - leafStart;
    if (local <= 0) return 0;
    if (local >= norm.length) return raw.length;
    return origIndex[local];
  };
  // Exclusive raw end for a normalized end offset.
  const rawEndOf = (normPos: number): number => {
    const lastLocal = normPos - 1 - leafStart; // last included normalized char
    if (lastLocal < 0) return 0;
    if (lastLocal >= norm.length - 1) return raw.length;
    return origIndex[lastLocal] + 1;
  };

  const nodes: ReactNode[] = [];
  let cursor = 0; // original-string cursor

  for (const span of overlapping) {
    const startRaw = rawStartOf(Math.max(span.start, leafStart));
    const endRaw = rawEndOf(Math.min(span.end, leafEnd));
    if (startRaw > cursor) {
      nodes.push(<Fragment key={keyer()}>{raw.slice(cursor, startRaw)}</Fragment>);
    }
    nodes.push(renderMark(raw.slice(startRaw, endRaw), span.highlights, ctx, keyer()));
    cursor = Math.max(cursor, endRaw);
  }
  if (cursor < raw.length) {
    nodes.push(<Fragment key={keyer()}>{raw.slice(cursor)}</Fragment>);
  }
  return <>{nodes}</>;
}

function renderMark(
  text: string,
  highlights: ParsedHighlight[],
  ctx: HighlightContextValue,
  key: number,
): ReactNode {
  const ids = highlights.map((h) => h.event.id);
  const isActive = ctx.activeId ? ids.includes(ctx.activeId) : false;
  // Hovered when any highlight in this segment is part of the hovered group —
  // so every segment of the same highlight reacts together, even across links.
  const isHovered = ctx.hoveredIds ? ids.some((id) => ctx.hoveredIds!.includes(id)) : false;
  const label =
    highlights.length > 1
      ? `${highlights.length} community highlights — click to read comments`
      : 'Community highlight — click to read the comment';
  return (
    <mark
      key={key}
      role="button"
      tabIndex={0}
      aria-label={label}
      title={label}
      data-active={isActive || undefined}
      data-hovered={isHovered || undefined}
      // No horizontal padding or per-segment rounding: a highlight that spans
      // several text leaves (e.g. across a link) must read as one continuous
      // run. `text-inherit` keeps nested links looking like links; the tint is
      // painted as a flowing background. Hover is driven by shared JS state
      // (not CSS :hover) so the whole highlight group reacts as one.
      className={
        'cursor-pointer bg-primary/25 text-inherit transition-colors ' +
        'focus-visible:outline-none focus-visible:bg-primary/40 ' +
        'data-[hovered=true]:bg-primary/40 ' +
        'data-[active=true]:bg-primary/50 box-decoration-clone'
      }
      onMouseEnter={() => ctx.onHover(ids)}
      onMouseLeave={() => ctx.onHover(null)}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        ctx.onActivate(highlights);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          ctx.onActivate(highlights);
        }
      }}
    >
      {text}
    </mark>
  );
}

/**
 * Recursively walk a rendered node tree, wrapping any text that falls inside a
 * matched span in <mark>. Offsets are tracked statefully across the whole tree
 * so a highlight may span multiple child elements (e.g. across a Markdown link
 * or bold run). Code spans are skipped (never marked).
 */
function walk(
  node: ReactNode,
  spans: HighlightSpan[],
  state: MarkState,
  ctx: HighlightContextValue,
  keyer: () => number,
): ReactNode {
  if (typeof node === 'string') {
    return markTextLeaf(node, spans, state, ctx, keyer);
  }
  if (typeof node === 'number') {
    return markTextLeaf(String(node), spans, state, ctx, keyer);
  }
  if (node === null || node === undefined || typeof node === 'boolean') return node;
  if (Array.isArray(node)) {
    return node.map((child, i) => <Fragment key={i}>{walk(child, spans, state, ctx, keyer)}</Fragment>);
  }
  if (isValidElement(node)) {
    const el = node as ReactElement<{ children?: ReactNode }>;
    const type = el.type;
    // Don't descend into code/pre (we never mark code) or into existing marks.
    if (type === 'code' || type === 'pre' || type === 'mark') {
      // Still advance offset state by the element's text content.
      advanceOverElement(el, state);
      return node;
    }
    const children = el.props?.children;
    if (children === undefined) return node;
    return cloneElement(el, undefined, walk(children, spans, state, ctx, keyer));
  }
  return node;
}

/** Advance `state.pos`/`prevSpace` over an element's text without marking. */
function advanceOverElement(node: ReactNode, state: MarkState): void {
  if (typeof node === 'string' || typeof node === 'number') {
    const { norm, prevSpace } = normalizeChunk(String(node), state.prevSpace);
    state.pos += norm.length;
    state.prevSpace = prevSpace;
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((c) => advanceOverElement(c, state));
    return;
  }
  if (isValidElement(node)) {
    const el = node as ReactElement<{ children?: ReactNode }>;
    advanceOverElement(el.props?.children, state);
  }
}

/** Collect the plain text of a node tree (normalization applied by caller). */
function collectRawText(node: ReactNode): string {
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (Array.isArray(node)) return node.map(collectRawText).join('');
  if (isValidElement(node)) {
    const el = node as ReactElement<{ children?: ReactNode }>;
    return collectRawText(el.props?.children);
  }
  return '';
}

/**
 * Wrap one block's children, marking any community-highlighted ranges. Matching
 * is performed across the WHOLE block (so highlights spanning links/bold/etc.
 * still match), then text leaves are split and wrapped in place.
 */
export function HighlightBlock({ children }: { children: ReactNode }) {
  const ctx = useHighlightContext();
  const matchers = ctx?.matchers;

  const spans = useMemo(() => {
    if (!matchers || matchers.length === 0) return [];
    const blockText = collectRawText(children);
    if (!blockText) return [];
    return findHighlightSpans(blockText, matchers);
    // Only the matcher set + content affect spans; hover/active state must not
    // trigger a re-match.
  }, [matchers, children]);

  if (!ctx || spans.length === 0) return <>{children}</>;

  let key = 0;
  const keyer = () => key++;
  const state: MarkState = { pos: 0, prevSpace: false };
  return <>{walk(children, spans, state, ctx, keyer)}</>;
}
