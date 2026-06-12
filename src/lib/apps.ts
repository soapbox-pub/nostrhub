import { nip19 } from 'nostr-tools';
import type { NostrEvent, NostrMetadata } from '@nostrify/nostrify';

/**
 * NIP-89 Handler Information events (kind 31990) announce Nostr applications:
 * the `content` field carries kind-0-style app metadata and `k` tags list the
 * event kinds the app can handle. This is the same discovery mechanism used by
 * app directories like Borkstr and nostrapp.link.
 */
export const APP_HANDLER_KIND = 31990;

/** Platform tags a kind 31990 event may carry (each tag value is a URL template). */
export const APP_PLATFORMS = ['web', 'ios', 'android', 'desktop', 'linux', 'macos', 'windows'] as const;

export type AppPlatform = (typeof APP_PLATFORMS)[number];

/**
 * Common `t` category tags used by real app listings, mirrored from the
 * Borkstr directory. Querying `#t` with this list (OR match) surfaces app
 * announcements that a plain recency query would miss.
 */
export const APP_CATEGORY_TAGS = [
  'social', 'tools', 'video', 'pictures', 'marketplace',
  'music', 'podcast', 'communities', 'messaging', 'dvm',
  'fitness', 'productivity', 'education', 'image', 'todo',
  'rideshare', 'ditto', 'mkstack',
  'relay', 'nostr', 'chat', 'news', 'article', 'blog',
  'media', 'images', 'hosting', 'code', 'pastebin',
  'storage', 'blossom', 'upload', 'tool',
  'zaps', 'goals', 'gigs', 'bounties', 'escrow', 'freelance',
  'bunker', 'desktop', 'ephemeral', 'password-manager',
  'nip46', 'nip96', 'nip-71',
  'distributed', 'decentralization',
];

/** GitHub blob base for official NIPs — same URL format used by NIP approvals and NIP forks. */
export const NIPS_REPO_BASE = 'https://github.com/nostr-protocol/nips/blob/master';

/** Extract a NIP number from a GitHub blob URL, e.g. ".../blob/master/01.md" → "01". */
export function nipNumberFromUrl(url: string): string | null {
  const m = url.match(/\/([A-F0-9]{2})\.md$/i);
  return m ? m[1].toUpperCase() : null;
}

/** Build the canonical GitHub blob URL for an official NIP number (e.g. "01" → full URL). */
export function nipGithubUrl(number: string): string {
  return `${NIPS_REPO_BASE}/${number.toUpperCase()}.md`;
}

/**
 * A NIP referenced by a kind 31990 app event.
 * - `type: 'custom'` — a community NIP (kind 30817), addressed by naddr coordinate.
 * - `type: 'official'` — an official NIP by number (e.g. "01", "34").
 */
export type AppNipRef =
  | { type: 'custom'; address: string; relayHint?: string }
  | { type: 'official'; number: string };

/** A NIP-34 git repository (kind 30617) referenced by a kind 31990 app event. */
export interface AppRepoRef {
  address: string;   // "30617:<pubkey>:<d>"
  pubkey: string;
  identifier: string;
  relayHint?: string;
}

/** A Zapstore app listing (kind 32267) referenced by a kind 31990 app event. */
export interface AppZapstoreRef {
  address: string;   // "32267:<pubkey>:<d>"
  pubkey: string;
  identifier: string;
  relayHint?: string;
}

/** Parsed app data from a kind 31990 event. */
export interface AppInfo {
  event: NostrEvent;
  pubkey: string;
  identifier: string;
  name: string;
  picture?: string;
  about?: string;
  website?: string;
  nip05?: string;
  /** Event kinds the app declares it can handle (`k` tags). */
  supportedKinds: number[];
  /** Platforms the app ships on (platform-named tags). */
  platforms: AppPlatform[];
  /** Category hashtags (`t` tags). */
  hashtags: string[];
  /** NIPs this app explicitly references (custom or official). */
  nipRefs: AppNipRef[];
  /** NIP-34 git repos this app is associated with. */
  repoRefs: AppRepoRef[];
  /** Zapstore app listing(s) for this app. */
  zapstoreRefs: AppZapstoreRef[];
  /** Plain address coordinate: "31990:<pubkey>:<d-tag>". */
  address: string;
  /** bech32 naddr for routing to the app's detail page. */
  naddr: string;
  createdAt: number;
}

/** Parse a kind 31990 event into structured AppInfo. Returns null if not an app event. */
export function parseAppEvent(event: NostrEvent): AppInfo | null {
  if (event.kind !== APP_HANDLER_KIND) return null;

  const identifier = event.tags.find(([name]) => name === 'd')?.[1];
  if (!identifier) return null;

  let metadata: NostrMetadata = {};
  if (event.content) {
    try {
      metadata = JSON.parse(event.content) as NostrMetadata;
    } catch {
      // content may be empty or invalid JSON
    }
  }

  const supportedKinds = Array.from(
    new Set(
      event.tags
        .filter(([name]) => name === 'k')
        .map(([, value]) => parseInt(value, 10))
        .filter((k) => Number.isInteger(k) && k >= 0),
    ),
  ).sort((a, b) => a - b);

  const platforms = new Set<AppPlatform>();
  for (const [name] of event.tags) {
    if ((APP_PLATFORMS as readonly string[]).includes(name)) {
      platforms.add(name as AppPlatform);
    }
  }

  const hashtags = Array.from(
    new Set(
      event.tags
        .filter(([name, value]) => name === 't' && value)
        .map(([, value]) => value.toLowerCase()),
    ),
  );

  // References carried by the event:
  // - `i` tags: official NIPs, either marker form (["i", "nip-01", "nip"]) or a
  //   NIP-73 GitHub blob URL (["i", "https://github.com/.../01.md"]).
  // - `a` tags: addressable refs, either marker form (["a", addr, hint, "nip" |
  //   "repo" | "zapstore"]) or plain — in which case the kind prefix of the
  //   address ("30817:", "30617:", "32267:") is unambiguous.
  const nipRefs: AppNipRef[] = [];
  const repoRefs: AppRepoRef[] = [];
  const zapstoreRefs: AppZapstoreRef[] = [];
  for (const tag of event.tags) {
    if (tag[0] === 'i' && tag[1]) {
      if (tag[2] === 'nip') {
        // value like "nip-01" → number "01"
        const num = tag[1].replace(/^nip-/i, '').padStart(2, '0');
        nipRefs.push({ type: 'official', number: num });
      } else {
        const num = nipNumberFromUrl(tag[1]);
        if (num) nipRefs.push({ type: 'official', number: num });
      }
      continue;
    }

    if (tag[0] !== 'a' || !tag[1]) continue;
    const parts = tag[1].split(':');
    const kindPrefix = parts[0];
    const marker = tag[3];
    const relayHint = tag[2] || undefined;

    if (marker === 'nip' || (!marker && kindPrefix === '30817')) {
      nipRefs.push({ type: 'custom', address: tag[1], relayHint });
    } else if (kindPrefix === '30617' && parts.length === 3 && (marker === 'repo' || !marker)) {
      repoRefs.push({ address: tag[1], pubkey: parts[1], identifier: parts[2], relayHint });
    } else if (kindPrefix === '32267' && parts.length === 3 && (marker === 'zapstore' || !marker)) {
      zapstoreRefs.push({ address: tag[1], pubkey: parts[1], identifier: parts[2], relayHint });
    }
  }

  return {
    event,
    pubkey: event.pubkey,
    identifier,
    name: metadata.name || metadata.display_name || identifier,
    picture: metadata.picture,
    about: metadata.about,
    website: metadata.website,
    nip05: metadata.nip05,
    supportedKinds,
    platforms: Array.from(platforms),
    hashtags,
    nipRefs,
    repoRefs,
    zapstoreRefs,
    address: `${APP_HANDLER_KIND}:${event.pubkey}:${identifier}`,
    naddr: nip19.naddrEncode({
      kind: APP_HANDLER_KIND,
      pubkey: event.pubkey,
      identifier,
    }),
    createdAt: event.created_at,
  };
}

/**
 * Whether an app listing carries the full metadata set (name, picture, about,
 * website). Kind 31990 is also used by DVM handlers, bots, and other services;
 * requiring complete metadata filters the directory down to real applications,
 * matching the approach of other Nostr app directories.
 */
export function hasFullAppMetadata(app: AppInfo): boolean {
  return Boolean(app.name && app.picture && app.about && app.website);
}

/**
 * Reduce kind 31990 events to the latest revision per (pubkey, d) address,
 * parsed into AppInfo and sorted newest first.
 */
export function dedupeAppEvents(events: NostrEvent[]): AppInfo[] {
  const latest = new Map<string, NostrEvent>();
  for (const event of events) {
    if (event.kind !== APP_HANDLER_KIND) continue;
    const d = event.tags.find(([name]) => name === 'd')?.[1];
    if (!d) continue;
    const key = `${event.pubkey}:${d}`;
    const prev = latest.get(key);
    if (!prev || event.created_at > prev.created_at) latest.set(key, event);
  }

  return Array.from(latest.values())
    .map(parseAppEvent)
    .filter((app): app is AppInfo => app !== null)
    .sort((a, b) => b.createdAt - a.createdAt);
}
