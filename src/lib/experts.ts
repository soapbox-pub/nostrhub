/**
 * Default "Nostr Experts" — well-known Nostr protocol developers whose NIP
 * approvals are counted for ranking and whose follow lists derive the
 * community author set. Users can edit this list freely in Settings.
 *
 * These hex pubkeys were resolved from verifiable NIP-05 identifiers.
 */
export const DEFAULT_EXPERTS: string[] = [
  // fiatjaf — creator of Nostr (_@fiatjaf.com)
  '3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d',
  // Will (jb55) — Damus, many NIPs (jb55@jb55.com)
  '32e1827635450ebb3c5a7d12c1f8e7b2b514439ac10a67eef3d9fd9c5c68e245',
  // hodlbod — Coracle, Welshman (hodlbod@coracle.social)
  '97c70a44366a6535c145b333f973ea86dfdc2d7a99da618c40c64705ad98e322',
  // Vitor Pamplona — Amethyst, many NIPs (_@vitorpamplona.com)
  '460c25e682fda7832b52d1f22d3d22b3176d972f60dcdc3212ed8c92ef85065c',
];

/**
 * Default cap on the derived community author set. The experts' most-followed
 * follows are ranked and truncated to this size. `null` disables the cap.
 */
export const DEFAULT_COMMUNITY_CAP = 1000;

/**
 * Default NIP-85 trusted-assertions provider pubkey, used as a source for
 * network statistics. Currently the Vertex DVM provider.
 */
export const DEFAULT_STATS_PROVIDER = '';
