/**
 * Relays known to support NIP-50 full-text search. Search queries are sent to
 * this group (not the default pool) since most general relays ignore the
 * `search` filter field and would return unfiltered firehose results.
 *
 * relay.ditto.pub is a specialized NIP-50 search relay with extended search
 * capabilities; relay.dreamith.to also supports the `search` filter.
 */
export const SEARCH_RELAYS = [
  'wss://relay.ditto.pub',
  'wss://relay.dreamith.to',
];
