import { NSchema as n } from '@nostrify/nostrify';

/**
 * Branded type for a validated 32-byte Nostr identifier (pubkey or event id):
 * a 64-character lowercase hex string.
 *
 * Use `isNostrId` to produce a `HexId` from untrusted input. Functions consuming
 * a `HexId` (e.g. `nip19.npubEncode` via wrappers) can trust it without
 * re-validating.
 */
export type HexId = string & { readonly __brand: 'HexId' };

const idSchema = n.id();

/**
 * Canonical validator for 32-byte Nostr identifiers — pubkeys and event ids.
 *
 * Use this **at the parse layer** whenever a pubkey or event id is extracted
 * from untrusted input (tag values, JSON content, URL params) before it reaches
 * `nip19.*Encode` or `nostr.query` filters. Malformed hex of the wrong length
 * throws deep inside `nip19`, which crashes the rendering subtree.
 *
 * Returns a type guard narrowing to {@link HexId}.
 */
export function isNostrId(value: unknown): value is HexId {
  return idSchema.safeParse(value).success;
}
