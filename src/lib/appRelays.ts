import type { RelayMetadata } from '@/contexts/AppContext';

/**
 * The Ditto relay. Used for network statistics because it supports the NIP-45
 * COUNT command and the `distinct:author` NIP-50 search extension.
 */
export const DITTO_RELAY = 'wss://relay.ditto.pub/';

/**
 * Relays that support the NIP-50 `search` capability. Search queries (any
 * filter containing a `search` field) are routed here by NostrProvider's
 * `reqRouter`, since the user's general read relays may not implement NIP-50.
 */
export const SEARCH_RELAYS: string[] = [
  'wss://relay.ditto.pub/',
  'wss://relay.dreamith.to/',
];

/**
 * Relay used solely for NIP-46 (remote signer / nostrconnect) communication.
 * Many remote signers (e.g. those built around Primal) default to this relay
 * for the connect handshake, so we always include it as an extra connection
 * option for NIP-46 — without adding it to the app's default NIP-65 relay list
 * (see `getRelayUrls()` in `useLoginActions`).
 */
export const NIP46_RELAY = 'wss://relay.primal.net';

/**
 * App default relays. Hardcoded in the app (not user-editable) and included in
 * the effective relay set whenever `useAppRelays` is enabled. Also used as a
 * fallback when the user has no NIP-65 relay list configured (e.g. during
 * nostrconnect handshakes before any user relays have been loaded).
 */
export const APP_RELAYS: RelayMetadata = {
  relays: [
    { url: 'wss://relay.ditto.pub/', read: true, write: true },
    { url: 'wss://relay.dreamith.to/', read: true, write: true },
  ],
  updatedAt: 0,
};

/** Normalize a relay URL for deduplication (lowercase, strip trailing slashes). */
function normalizeUrl(url: string): string {
  return url.toLowerCase().replace(/\/+$/, '');
}

/**
 * Get the effective relay list based on user settings.
 *
 * - `useAppRelays`: when true, the hardcoded app-default relays are included (first).
 * - `useUserRelays`: when true, the user's personal NIP-65 list is included.
 *
 * When both flags are off the result is empty. When both are on the two lists
 * are merged with app relays first, deduplicated by normalized URL.
 */
export function getEffectiveRelays(
  userRelays: RelayMetadata,
  useAppRelays: boolean,
  useUserRelays: boolean,
): RelayMetadata {
  const seen = new Set<string>();
  const mergedRelays: RelayMetadata['relays'] = [];

  const sources: RelayMetadata['relays'] = [];
  if (useAppRelays) sources.push(...APP_RELAYS.relays);
  if (useUserRelays) sources.push(...userRelays.relays);

  for (const relay of sources) {
    const normalized = normalizeUrl(relay.url);
    if (!seen.has(normalized)) {
      seen.add(normalized);
      mergedRelays.push(relay);
    }
  }

  return {
    relays: mergedRelays,
    updatedAt: userRelays.updatedAt,
  };
}
