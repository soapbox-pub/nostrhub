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
}

export const HighlightContext = createContext<HighlightContextValue | null>(null);

/**
 * Normalize text for matching: collapse whitespace and lowercase. We compare
 * normalized forms so that markdown soft-wraps / multiple spaces don't defeat
 * the match, while still mapping back to the original substring.
 */
export function normalizeForMatch(value: string): string {
  return value.replace(/\s+/g, ' ').toLowerCase();
}

export interface HighlightSpan {
  start: number;
  end: number;
  highlights: ParsedHighlight[];
}

/**
 * Find, within `original`, all character ranges that correspond to any
 * matcher's needle. Matching is whitespace-insensitive and case-insensitive.
 * Overlapping highlights are merged into a single span carrying all of them.
 */
export function findHighlightSpans(
  original: string,
  matchers: HighlightMatcher[],
): HighlightSpan[] {
  if (matchers.length === 0) return [];

  // Build a normalized version of `original` plus a map back to original
  // offsets. Each normalized char maps to the original index it came from.
  const normChars: string[] = [];
  const normToOrig: number[] = [];
  let prevSpace = false;
  for (let i = 0; i < original.length; i++) {
    const ch = original[i];
    if (/\s/.test(ch)) {
      if (prevSpace) continue; // collapse runs
      normChars.push(' ');
      normToOrig.push(i);
      prevSpace = true;
    } else {
      normChars.push(ch.toLowerCase());
      normToOrig.push(i);
      prevSpace = false;
    }
  }
  const norm = normChars.join('');

  const raw: HighlightSpan[] = [];
  for (const m of matchers) {
    const needle = m.needle.trim();
    if (!needle) continue;
    let from = 0;
    for (;;) {
      const idx = norm.indexOf(needle, from);
      if (idx === -1) break;
      const startOrig = normToOrig[idx];
      const endNorm = idx + needle.length - 1;
      const endOrig = normToOrig[endNorm] + 1;
      raw.push({ start: startOrig, end: endOrig, highlights: [m.highlight] });
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
