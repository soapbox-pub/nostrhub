import type { NostrEvent } from '@nostrify/nostrify';
import { nip19 } from 'nostr-tools';

/** Addressable event kind for community-authored ("custom") NIPs. */
export const CUSTOM_NIP_KIND = 30817;

/** NIP-32 label namespace + value used for expert NIP curation. */
export const APPROVE_LABEL_NAMESPACE = 'nostrhub';
export const APPROVE_LABEL_VALUE = 'approve';

export interface CustomNip {
  event: NostrEvent;
  /** `d` tag identifier (slug). */
  identifier: string;
  title: string;
  /** Event kind numbers this NIP defines/concerns (`k` tags). */
  kinds: string[];
  /**
   * Human-readable names for the `k` tags, keyed by kind number (from `k[2]`).
   * Sparse: older events may omit names, so a number is not guaranteed a name.
   */
  kindNames: Record<string, string>;
  content: string;
  author: string;
  createdAt: number;
  /** Address coordinate: `30817:<pubkey>:<d>`. */
  address: string;
  /** naddr-encoded reference for routing. */
  naddr: string;
  /** Fork reference, if this NIP is a fork. */
  fork?: { type: 'custom'; address: string } | { type: 'official'; url: string };
}

const tag = (event: NostrEvent, name: string): string | undefined =>
  event.tags.find(([n]) => n === name)?.[1];

/** A kind-30817 event is valid if it has a `d` and `title` tag. */
export function isValidCustomNip(event: NostrEvent): boolean {
  if (event.kind !== CUSTOM_NIP_KIND) return false;
  return Boolean(tag(event, 'd') && tag(event, 'title'));
}

/** Parse a raw kind-30817 event into a structured `CustomNip`. */
export function parseCustomNip(event: NostrEvent): CustomNip {
  const identifier = tag(event, 'd') ?? '';
  const title = tag(event, 'title') ?? 'Untitled NIP';
  const kTags = event.tags.filter(([n, v]) => n === 'k' && v);
  const kinds = kTags.map(([, v]) => v);
  // Names are positional metadata (k[2]); older events omit them, so the map
  // stays sparse — display code must tolerate a missing name for any kind.
  const kindNames: Record<string, string> = {};
  for (const [, kind, name] of kTags) {
    if (name?.trim()) kindNames[kind] = name.trim();
  }

  let fork: CustomNip['fork'];
  const forkA = event.tags.find(([n, , , marker]) => n === 'a' && marker === 'fork');
  const forkI = event.tags.find(([n, , marker]) => n === 'i' && marker === 'fork');
  if (forkA?.[1]) fork = { type: 'custom', address: forkA[1] };
  else if (forkI?.[1]) fork = { type: 'official', url: forkI[1] };

  const address = `${CUSTOM_NIP_KIND}:${event.pubkey}:${identifier}`;
  const naddr = nip19.naddrEncode({ kind: CUSTOM_NIP_KIND, pubkey: event.pubkey, identifier });

  return {
    event,
    identifier,
    title,
    kinds,
    kindNames,
    content: event.content,
    author: event.pubkey,
    createdAt: event.created_at,
    address,
    naddr,
    fork,
  };
}

/** Internal route for a NIP, official (by number) or custom (by naddr). */
export function nipHref(nip: { number?: string; custom?: { naddr: string } }): string {
  if (nip.custom) return `/${nip.custom.naddr}`;
  return `/nip/${nip.number}`;
}

/** Convert a title into a kebab-case slug suitable for a `d` tag. */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

/**
 * Generate a random, opaque identifier for a new addressable event's `d` tag.
 *
 * We deliberately avoid deriving identifiers from the title: a title-based slug
 * leaks the title into the address, collides when two items share a title, and
 * lets anyone guess/squat an address before it's published. A random id keeps
 * the address stable and unguessable, and is never shown in the UI.
 */
export function generateIdentifier(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID.
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
