import type { NostrEvent } from '@nostrify/nostrify';
import { verifyEvent } from 'nostr-tools/pure';

const HEX64 = /^[0-9a-f]{64}$/;
const HEX128 = /^[0-9a-f]{128}$/;

/**
 * A well-formed, validly signed Nostr event, or null. Everything the worker
 * handles arrives from a relay by way of a napp host, and Tenna doesn't verify
 * before delivery, so nothing is read until it has passed through here.
 * Without the signature check a hostile relay could put words in a
 * stranger's mouth.
 */
export function parseEvent(candidate: unknown): NostrEvent | null {
  if (!candidate || typeof candidate !== 'object') return null;
  const e = candidate as Record<string, unknown>;
  if (
    typeof e.id !== 'string' || !HEX64.test(e.id) ||
    typeof e.pubkey !== 'string' || !HEX64.test(e.pubkey) ||
    typeof e.sig !== 'string' || !HEX128.test(e.sig) ||
    !Number.isInteger(e.kind) || !Number.isInteger(e.created_at) ||
    typeof e.content !== 'string' ||
    !Array.isArray(e.tags) ||
    !e.tags.every((tag) => Array.isArray(tag) && tag.every((v) => typeof v === 'string'))
  ) {
    return null;
  }
  const event: NostrEvent = {
    id: e.id,
    pubkey: e.pubkey,
    sig: e.sig,
    kind: e.kind as number,
    created_at: e.created_at as number,
    content: e.content,
    tags: e.tags as string[][],
  };
  try {
    return verifyEvent(event) ? event : null;
  } catch {
    return null;
  }
}
