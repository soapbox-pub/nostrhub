import type { RelayMetadata } from '@/contexts/AppContext';

/**
 * The Ditto relay. Used for network statistics because it supports the NIP-45
 * COUNT command and the `distinct:author` NIP-50 search extension.
 */
export const DITTO_RELAY = 'wss://relay.ditto.pub/';

/**
 * App default relays. Used as the initial `relayMetadata` for new users and as
 * a fallback when the user has no NIP-65 relay list configured (e.g. during
 * nostrconnect handshakes before any user relays have been loaded).
 */
export const APP_RELAYS: RelayMetadata = {
  relays: [
    { url: 'wss://relay.ditto.pub', read: true, write: true },
    { url: 'wss://relay.primal.net', read: true, write: true },
    { url: 'wss://relay.damus.io', read: true, write: true },
  ],
  updatedAt: 0,
};
