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
 * App default relays. Used as the initial `relayMetadata` for new users and as
 * a fallback when the user has no NIP-65 relay list configured (e.g. during
 * nostrconnect handshakes before any user relays have been loaded).
 */
export const APP_RELAYS: RelayMetadata = {
  relays: [
    { url: 'wss://relay.ditto.pub/', read: true, write: true },
    { url: 'wss://relay.dreamith.to/', read: true, write: true },
    { url: 'wss://relay.primal.net/', read: true, write: true },
  ],
  updatedAt: 0,
};
