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
  const kinds = event.tags.filter(([n]) => n === 'k').map(([, v]) => v).filter(Boolean);

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
