import type { NostrEvent } from '@nostrify/nostrify';
import { nip19 } from 'nostr-tools';

import { APP_HANDLER_KIND } from '@/lib/apps';
import { CUSTOM_NIP_KIND } from '@/lib/nips';
import { GIT_REPO_KIND } from '@/lib/git';
import { GRAPH_NODE_KIND } from '@/lib/planGraph';
import { ZAPSTORE_RELEASE_KIND, ZAPSTORE_APP_KIND } from '@/lib/zapstore';
import { ARTICLE_KIND } from '@/hooks/useExpertPress';

/**
 * The addressable content kinds a NostrHub user can author and that other users
 * can act on (react, review, comment, approve). Each maps a kind to a
 * human-readable label used in notification copy.
 */
export const OWNED_CONTENT_KINDS = [
  APP_HANDLER_KIND, // 31990 — app listing
  CUSTOM_NIP_KIND, // 30817 — community NIP
  ARTICLE_KIND, // 30023 — long-form article
  GIT_REPO_KIND, // 30617 — git repo announcement
  GRAPH_NODE_KIND, // 32473 — strategy graph node
] as const;

export type OwnedContentKind = (typeof OWNED_CONTENT_KINDS)[number];

/** Short human label for a piece of owned content, by kind. */
export const CONTENT_KIND_LABEL: Record<number, string> = {
  [APP_HANDLER_KIND]: 'app',
  [CUSTOM_NIP_KIND]: 'NIP',
  [ARTICLE_KIND]: 'article',
  [GIT_REPO_KIND]: 'repo',
  [GRAPH_NODE_KIND]: 'strategy node',
};

/** A resolved piece of the current user's content, keyed by its coordinate. */
export interface OwnedContent {
  /** Addressable coordinate: `kind:pubkey:dTag`. */
  coordinate: string;
  kind: number;
  /** Human-readable title (falls back to the d-tag). */
  title: string;
  /** Route to the content's detail page (its naddr). */
  href: string;
}

/** Read the first value of a given tag name. */
export function firstTag(event: NostrEvent, name: string): string | undefined {
  return event.tags.find(([n]) => n === name)?.[1];
}

/**
 * Build an {@link OwnedContent} entry from an addressable event the user
 * authored. Returns `null` for events without a `d` tag (not addressable).
 */
export function toOwnedContent(event: NostrEvent): OwnedContent | null {
  const dTag = firstTag(event, 'd');
  if (dTag === undefined) return null;

  const coordinate = `${event.kind}:${event.pubkey}:${dTag}`;
  const title =
    firstTag(event, 'title') ||
    firstTag(event, 'name') ||
    firstTag(event, 'alt') ||
    dTag ||
    CONTENT_KIND_LABEL[event.kind] ||
    'your content';

  const naddr = nip19.naddrEncode({
    kind: event.kind,
    pubkey: event.pubkey,
    identifier: dTag,
  });

  return { coordinate, kind: event.kind, title, href: `/${naddr}` };
}
