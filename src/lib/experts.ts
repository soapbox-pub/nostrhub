/**
 * Kind of the replaceable event that stores a user's "Nostr Experts" list.
 *
 * 12022 sits in the replaceable range (10000–19999) — one event per pubkey, no
 * `d` tag — and is deliberately off the standard NIP-51 list kinds so it never
 * collides with a real list. Experts are stored as `p` tags (public) or
 * NIP-44-encrypted into `content` (private), mirroring NIP-51 list semantics.
 */
export const EXPERTS_LIST_KIND = 12022;

/**
 * Default "Nostr Experts" — well-known Nostr protocol developers whose NIP
 * approvals are counted for ranking and whose follow lists derive the
 * community author set. Used as the read-fallback baseline until the user
 * publishes their own list. Users can edit this list freely in Settings.
 *
 * These hex pubkeys were resolved from verifiable NIP-05 identifiers.
 */
export const DEFAULT_EXPERTS: string[] = [
  // fiatjaf — creator of Nostr (_@fiatjaf.com)
  '3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d',
  // AsaiToshiya — Nostr developer, NIP contributor (_@asaitoshiya.com)
  '0a2f19dc1a185792c3b0376f1d7f9971295e8932966c397935a5dddd1451a25a',
  // hodlbod — Coracle, Welshman (hodlbod@coracle.social)
  '97c70a44366a6535c145b333f973ea86dfdc2d7a99da618c40c64705ad98e322',
  // Vitor Pamplona — Amethyst, many NIPs (_@vitorpamplona.com)
  '460c25e682fda7832b52d1f22d3d22b3176d972f60dcdc3212ed8c92ef85065c',
  // Alex Gleason — Soapbox, Ditto (alex@gleasonator.com)
  '0461fcbecc4c3374439932d6b8f11269ccdb7cc973ad7a50ae362db135a474dd',
  // PABLOF7z — NDK, many NIPs (_@f7z.io)
  'fa984bd7dbb282f07e16e7ae87b26a2a7b9b90b7246a44771f0cf5ae58018f52',
  // semisol — nostr.land relay, firmware dev (semisol@nostr.land)
  '52b4a076bcbbbdc3a1aefa3735816cf74993b1b8db202b01c883c58be7fad8bd',
  // arthurfranca — Nostr developer & designer (github.com/arthurfranca)
  'fc7085c383ba71745704bdc1c6efcf7fab0197501de598c5e6c537ac0b32a4cb',
  // Will (jb55) — Damus, npubs, zaps (_@jb55.com)
  '32e1827635450ebb3c5a7d12c1f8e7b2b514439ac10a67eef3d9fd9c5c68e245',
  // Kieran — Snort, zap.stream (kieran@snort.social)
  '63fe6318dc58583cfe16810f86dd09e18bfd76aabc24a0081ce2856f330504ed',
  // greenart7c3 — Amber, Citrine, Amethyst contributor (greenart7c3.com)
  '7579076d9aff0a4cfdefa7e2045f2486c7e5d8bc63bfc6b45397233e1bbfcb19',
  // mattn — Go/Vim hacker, Nostr developer (_@compile-error.net)
  '2c7cc62a697ea3a7826521f3fd34f0cb273693cbe5e9310f35449f43622a5cdc',
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
