import type { NostrEvent } from '@nostrify/nostrify';
import { nip19 } from 'nostr-tools';
import { CUSTOM_NIP_KIND } from '@/lib/nips';
import { ARTICLE_KIND } from '@/hooks/useExpertPress';

/**
 * NIP-37 Draft Wraps.
 *
 * Kind 31234 stores an unsigned draft event of any other kind, JSON-stringified
 * and NIP-44-encrypted to the author's own pubkey. A `k` tag records the kind of
 * the wrapped draft so we can route it back to the right editor, and a blank
 * `content` field signals the draft has been deleted.
 *
 * We use one draft kind for both community NIPs (30817) and long-form articles
 * (30023); the wrapped event's kind (mirrored in the `k` tag) disambiguates.
 */
export const DRAFT_WRAP_KIND = 31234;

/** Kinds we support drafting. */
export type DraftableKind = typeof CUSTOM_NIP_KIND | typeof ARTICLE_KIND;

export function isDraftableKind(kind: number): kind is DraftableKind {
  return kind === CUSTOM_NIP_KIND || kind === ARTICLE_KIND;
}

/** The unsigned event we stash inside a draft wrap (exactly what we'd publish). */
export interface DraftEventTemplate {
  kind: number;
  content: string;
  tags: string[][];
}

/** A decrypted draft, enriched for display and resume. */
export interface Draft {
  /** `d` tag of the kind-31234 wrapper. */
  slug: string;
  /** Kind of the wrapped draft event (30817 or 30023). */
  kind: number;
  /** The unsigned draft event ready to rehydrate an editor. */
  template: DraftEventTemplate;
  /** Human-readable title pulled from the wrapped event's `title` tag. */
  title: string;
  /** Unix-seconds timestamp of the wrapper event. */
  updatedAt: number;
  /** Event id of the kind-31234 wrapper (for deletion). */
  eventId: string;
}

const tag = (tags: string[][], name: string): string | undefined =>
  tags.find(([n]) => n === name)?.[1];

/** Generate a unique `d` tag for a new draft wrap. */
export function newDraftSlug(): string {
  return `draft-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

/** Recommended NIP-40 expiration: 90 days from now (seconds). */
export function draftExpiration(): number {
  return Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60;
}

/**
 * Parse a decrypted draft-wrap payload + its wrapper event into a `Draft`.
 * Returns `null` if the payload is malformed or the wrapped kind is unsupported.
 */
export function parseDraft(event: NostrEvent, plaintext: string): Draft | null {
  const slug = tag(event.tags, 'd');
  if (!slug) return null;

  let template: DraftEventTemplate;
  try {
    const parsed = JSON.parse(plaintext) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { kind, content, tags } = parsed as Record<string, unknown>;
    if (typeof kind !== 'number' || !isDraftableKind(kind)) return null;
    template = {
      kind,
      content: typeof content === 'string' ? content : '',
      tags: Array.isArray(tags) ? (tags as string[][]) : [],
    };
  } catch {
    return null;
  }

  const title = tag(template.tags, 'title')?.trim() || 'Untitled draft';

  return {
    slug,
    kind: template.kind,
    template,
    title,
    updatedAt: event.created_at,
    eventId: event.id,
  };
}

/** Where to resume a draft of a given kind. */
export function draftResumeHref(draft: Draft): string {
  if (draft.kind === ARTICLE_KIND) return `/articles/create?draft=${encodeURIComponent(draft.slug)}`;
  return `/create?draft=${encodeURIComponent(draft.slug)}`;
}

/** Naddr coordinate of a draft wrap (handy for routing/keys). */
export function draftNaddr(pubkey: string, slug: string): string {
  return nip19.naddrEncode({ kind: DRAFT_WRAP_KIND, pubkey, identifier: slug });
}

/** Short label for the kind of content a draft holds. */
export function draftKindLabel(kind: number): string {
  if (kind === ARTICLE_KIND) return 'Article';
  if (kind === CUSTOM_NIP_KIND) return 'NIP';
  return 'Draft';
}
