import type { NostrEvent } from '@nostrify/nostrify';
import { sanitizeUrl } from '@/lib/sanitizeUrl';

/** NIP-84 highlight event kind. */
export const HIGHLIGHT_KIND = 9802;

/** Hard caps to keep highlights sane (and relays happy). */
export const MAX_HIGHLIGHT_LENGTH = 5000;
export const MAX_CONTEXT_LENGTH = 8000;

/**
 * Identifies the piece of content a highlight points at. A highlight references
 * exactly one of:
 *   - an addressable event (articles, custom NIPs) via an `a` tag, OR
 *   - a regular event via an `e` tag, OR
 *   - an external URL (official NIPs, fetched from GitHub) via an `r` tag.
 */
export type HighlightSource =
  | {
      type: 'addressable';
      /** Coordinate "kind:pubkey:d". */
      addr: string;
      /** Original author, attributed via `p`. */
      pubkey: string;
    }
  | {
      type: 'event';
      id: string;
      pubkey: string;
    }
  | {
      type: 'url';
      url: string;
      /** Optional Nostr author of the URL's content, attributed via `p`. */
      pubkey?: string;
    };

/** Build a Nostr filter that finds every highlight referencing this source. */
export function highlightSourceFilter(source: HighlightSource): Record<string, unknown> {
  const base = { kinds: [HIGHLIGHT_KIND] };
  switch (source.type) {
    case 'addressable':
      return { ...base, '#a': [source.addr] };
    case 'event':
      return { ...base, '#e': [source.id] };
    case 'url':
      return { ...base, '#r': [source.url] };
  }
}

/** A stable string key for a source, for use in query keys. */
export function highlightSourceKey(source: HighlightSource): string {
  switch (source.type) {
    case 'addressable':
      return `a:${source.addr}`;
    case 'event':
      return `e:${source.id}`;
    case 'url':
      return `r:${source.url}`;
  }
}

/**
 * Build the tag set for a new kind-9802 highlight event.
 *
 * NostrHub extension: the highlighter's `comment` is REQUIRED (the UI never
 * publishes a highlight without one), stored in a NIP-84 `comment` tag. The
 * highlighted excerpt itself goes in the event `content`.
 */
export function buildHighlightTags(
  source: HighlightSource,
  comment: string,
  context?: string,
): string[][] {
  const tags: string[][] = [];

  switch (source.type) {
    case 'addressable':
      tags.push(['a', source.addr]);
      tags.push(['p', source.pubkey, '', 'author']);
      break;
    case 'event':
      tags.push(['e', source.id]);
      tags.push(['p', source.pubkey, '', 'author']);
      break;
    case 'url':
      tags.push(['r', source.url]);
      if (source.pubkey) tags.push(['p', source.pubkey, '', 'author']);
      break;
  }

  if (context && context !== source.type) {
    const trimmed = context.slice(0, MAX_CONTEXT_LENGTH);
    tags.push(['context', trimmed]);
  }

  // Required commentary (NostrHub mandates this; NIP-84 leaves it optional).
  tags.push(['comment', comment.trim()]);

  // NIP-31 fallback for clients that don't understand kind 9802.
  tags.push(['alt', 'Highlight']);

  return tags;
}

/** A parsed, displayable highlight derived from a kind-9802 event. */
export interface ParsedHighlight {
  event: NostrEvent;
  /** The highlighted excerpt (event content). */
  text: string;
  /** The highlighter's commentary. */
  comment: string;
  /** Surrounding context, if provided. */
  context?: string;
}

/**
 * Parse a kind-9802 event into a {@link ParsedHighlight}, or return null if it
 * isn't a usable NostrHub highlight (must have non-empty text + comment).
 */
export function parseHighlight(event: NostrEvent): ParsedHighlight | null {
  if (event.kind !== HIGHLIGHT_KIND) return null;
  const text = event.content.trim();
  if (!text) return null;
  const comment = event.tags.find(([n]) => n === 'comment')?.[1]?.trim();
  if (!comment) return null;
  const context = event.tags.find(([n]) => n === 'context')?.[1]?.trim() || undefined;
  return { event, text, comment, context };
}

/** Source builders for each page type. */

export function articleHighlightSource(pubkey: string, kind: number, identifier: string): HighlightSource {
  return { type: 'addressable', addr: `${kind}:${pubkey}:${identifier}`, pubkey };
}

/** The canonical URL identifier for an official NIP highlight source. */
export function officialNipHighlightUrl(code: string): string {
  return `https://github.com/nostr-protocol/nips/blob/master/${code}.md`;
}

export function officialNipHighlightSource(code: string): HighlightSource {
  const url = sanitizeUrl(officialNipHighlightUrl(code))!;
  return { type: 'url', url };
}
