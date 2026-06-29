import { createContext } from 'react';
import type { ParsedHighlight } from '@/lib/highlightSource';

/** A highlight occurrence to be marked within the rendered text. */
export interface HighlightMatcher {
  /** Normalized excerpt text to search for (whitespace-collapsed, lowercased). */
  needle: string;
  highlight: ParsedHighlight;
}

export interface HighlightContextValue {
  matchers: HighlightMatcher[];
  /** Called with the set of highlights overlapping a clicked mark. */
  onActivate: (highlights: ParsedHighlight[]) => void;
  /** The event id of the currently-active (open) highlight, if any. */
  activeId?: string;
  /** Set the currently-hovered highlight group (event ids), or null to clear. */
  onHover: (ids: string[] | null) => void;
  /** Event ids of the highlight group currently hovered, for cross-segment styling. */
  hoveredIds?: string[];
}

export const HighlightContext = createContext<HighlightContextValue | null>(null);

export interface HighlightSpan {
  /** Start offset into the NORMALIZED (whitespace-collapsed, lowercased) text. */
  start: number;
  /** End offset (exclusive) into the normalized text. */
  end: number;
  highlights: ParsedHighlight[];
}

/**
 * Normalize text for matching: collapse runs of whitespace to a single space
 * and lowercase. This MUST match the per-chunk normalization used by the
 * renderer so that span offsets line up with rendered text leaves.
 */
export function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Find, within `original`, all ranges (in NORMALIZED coordinates) that match
 * any matcher's needle. Matching is whitespace-insensitive and
 * case-insensitive. Overlapping highlights are merged into a single span
 * carrying all of them.
 */
export function findHighlightSpans(
  original: string,
  matchers: HighlightMatcher[],
): HighlightSpan[] {
  if (matchers.length === 0) return [];

  const norm = normalizeText(original);

  const raw: HighlightSpan[] = [];
  for (const m of matchers) {
    const needle = m.needle.trim();
    if (!needle) continue;
    let from = 0;
    for (;;) {
      const idx = norm.indexOf(needle, from);
      if (idx === -1) break;
      raw.push({ start: idx, end: idx + needle.length, highlights: [m.highlight] });
      from = idx + needle.length;
    }
  }

  if (raw.length === 0) return [];

  // Merge overlapping / adjacent spans, collecting their highlights.
  raw.sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: HighlightSpan[] = [];
  for (const span of raw) {
    const last = merged[merged.length - 1];
    if (last && span.start <= last.end) {
      last.end = Math.max(last.end, span.end);
      for (const h of span.highlights) {
        if (!last.highlights.some((x) => x.event.id === h.event.id)) {
          last.highlights.push(h);
        }
      }
    } else {
      merged.push({ ...span, highlights: [...span.highlights] });
    }
  }
  return merged;
}
