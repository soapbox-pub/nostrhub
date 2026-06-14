import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';
import { nip19 } from 'nostr-tools';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import { APP_PLATFORMS, type AppPlatform } from '@/lib/apps';
import {
  ZAPSTORE_ASSET_KIND,
  ZAPSTORE_INDEXER_PUBKEY,
  ZAPSTORE_RELEASE_KIND,
  isValidRelease,
  parseAsset,
  parseRelease,
  type ZapstoreAsset,
  type ZapstoreRelease,
} from '@/lib/zapstore';

/** kind number for NIP-82 / Zapstore Software Application events. */
export const ZAPSTORE_APP_KIND = 32267;

/**
 * Base URL for an app's public page on the Zapstore web app — the "escape
 * hatch" link out of an in-app listing. Zapstore addresses apps by their
 * package identifier (the `d` tag), e.g. `to.treasures.app`.
 */
export function zapstoreAppUrl(identifier: string): string {
  return `https://zapstore.dev/app/${encodeURIComponent(identifier)}`;
}

/** Map a NIP-82 `f` tag (e.g. "android-arm64-v8a", "darwin-arm64") to a platform. */
function platformFromFTag(f: string): AppPlatform | null {
  const v = f.toLowerCase();
  if (v.startsWith('android')) return 'android';
  if (v.startsWith('ios')) return 'ios';
  if (v.startsWith('darwin') || v.startsWith('macos')) return 'macos';
  if (v.startsWith('windows')) return 'windows';
  if (v.startsWith('linux')) return 'linux';
  if (v.startsWith('web')) return 'web';
  return null;
}

/** Parsed representation of a kind 32267 Zapstore app listing. */
export interface ZapstoreApp {
  event: NostrEvent;
  pubkey: string;
  /** Package identifier (d tag), e.g. "to.treasures.app". */
  identifier: string;
  name: string;
  summary?: string;
  /** Long-form description — the event `content` (markdown). */
  description?: string;
  /** Sanitized https icon URL. */
  icon?: string;
  /** Sanitized https screenshot/preview image URLs (`image` tags). */
  screenshots: string[];
  /** Sanitized https homepage URL (`url` or `website` tag). */
  website?: string;
  /** Latest version string (`version` tag), when published on the listing. */
  version?: string;
  /** Platforms derived from NIP-82 `f` architecture tags. */
  platforms: AppPlatform[];
  /** Category hashtags (`t` tags). */
  categories: string[];
  /** Address coordinate "32267:<pubkey>:<d>". */
  address: string;
  /** bech32 naddr for routing. */
  naddr: string;
  createdAt: number;
}

function parseZapstoreApp(event: NostrEvent): ZapstoreApp | null {
  if (event.kind !== ZAPSTORE_APP_KIND) return null;
  const identifier = event.tags.find(([n]) => n === 'd')?.[1];
  if (!identifier) return null;

  const tag = (name: string) => event.tags.find(([n]) => n === name)?.[1];
  const tagValues = (name: string) =>
    event.tags.filter(([n, v]) => n === name && v).map(([, v]) => v);

  const platforms = Array.from(
    new Set(tagValues('f').map(platformFromFTag).filter((p): p is AppPlatform => p !== null)),
  ).sort((a, b) => APP_PLATFORMS.indexOf(a) - APP_PLATFORMS.indexOf(b));

  const categories = Array.from(
    new Set(tagValues('t').map((t) => t.trim().toLowerCase()).filter(Boolean)),
  );

  const content = event.content.trim();

  const screenshots = Array.from(
    new Set(
      tagValues('image')
        .map((url) => sanitizeUrl(url))
        .filter((u): u is string => Boolean(u)),
    ),
  );

  return {
    event,
    pubkey: event.pubkey,
    identifier,
    name: tag('name') ?? identifier,
    summary: tag('summary'),
    description: content || undefined,
    icon: sanitizeUrl(tag('icon')),
    screenshots,
    website: sanitizeUrl(tag('url') ?? tag('website')),
    version: tag('version'),
    platforms,
    categories,
    address: `${ZAPSTORE_APP_KIND}:${event.pubkey}:${identifier}`,
    naddr: nip19.naddrEncode({ kind: ZAPSTORE_APP_KIND, pubkey: event.pubkey, identifier }),
    createdAt: event.created_at,
  };
}

/**
 * NIP-50 autocomplete search over Zapstore app listings (kind 32267).
 * Sent with `autocomplete:true` so partial words match while the user types.
 */
export function useZapstoreSearch(query: string, limit = 20) {
  const { nostr } = useNostr();
  const trimmed = query.trim();

  return useQuery<ZapstoreApp[]>({
    queryKey: ['zapstore-search', trimmed, limit],
    queryFn: async ({ signal }) => {
      if (!trimmed) return [];

      const events = await nostr.query(
        [{ kinds: [ZAPSTORE_APP_KIND], search: `autocomplete:true ${trimmed}`, limit }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) },
      );

      // Keep latest per (pubkey, d) address.
      const latest = new Map<string, NostrEvent>();
      for (const ev of events) {
        if (ev.kind !== ZAPSTORE_APP_KIND) continue;
        const d = ev.tags.find(([n]) => n === 'd')?.[1];
        if (!d) continue;
        const key = `${ev.pubkey}:${d}`;
        const prev = latest.get(key);
        if (!prev || ev.created_at > prev.created_at) latest.set(key, ev);
      }

      return Array.from(latest.values())
        .map(parseZapstoreApp)
        .filter((a): a is ZapstoreApp => a !== null);
    },
    enabled: trimmed.length > 0,
    staleTime: 30 * 1000,
  });
}

/**
 * Fetch a single Zapstore listing (kind 32267) by its (pubkey, d-tag) address.
 * Used to resolve references on app detail pages into rich rows.
 */
export function useZapstoreApp(pubkey: string | undefined, identifier: string | undefined) {
  const { nostr } = useNostr();

  return useQuery<ZapstoreApp | null>({
    queryKey: ['zapstore-app', pubkey, identifier],
    queryFn: async ({ signal }) => {
      const events = await nostr.query(
        [{ kinds: [ZAPSTORE_APP_KIND], authors: [pubkey!], '#d': [identifier!], limit: 5 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) },
      );

      const latest = events
        .filter((ev) => ev.kind === ZAPSTORE_APP_KIND)
        .sort((a, b) => b.created_at - a.created_at)[0];
      return latest ? parseZapstoreApp(latest) : null;
    },
    enabled: Boolean(pubkey && identifier),
    staleTime: 60 * 1000,
  });
}

/**
 * Fetch Zapstore listings (kind 32267) authored by a specific pubkey.
 * Used to populate the "your listings" scrollbox in the submission form.
 */
export function useMyZapstoreApps(pubkey: string | undefined) {
  const { nostr } = useNostr();

  return useQuery<ZapstoreApp[]>({
    queryKey: ['zapstore-apps-by-author', pubkey],
    queryFn: async ({ signal }) => {
      const events = await nostr.query(
        [{ kinds: [ZAPSTORE_APP_KIND], authors: [pubkey!], limit: 100 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) },
      );

      const latest = new Map<string, NostrEvent>();
      for (const ev of events) {
        if (ev.kind !== ZAPSTORE_APP_KIND) continue;
        const d = ev.tags.find(([n]) => n === 'd')?.[1];
        if (!d) continue;
        const key = `${ev.pubkey}:${d}`;
        const prev = latest.get(key);
        if (!prev || ev.created_at > prev.created_at) latest.set(key, ev);
      }

      return Array.from(latest.values())
        .map(parseZapstoreApp)
        .filter((a): a is ZapstoreApp => a !== null)
        .sort((a, b) => b.event.created_at - a.event.created_at);
    },
    enabled: Boolean(pubkey),
    staleTime: 60 * 1000,
  });
}

/**
 * Fetch the release history (kind 30063) for a Zapstore app, newest first.
 *
 * Releases reference the app they belong to via an `i` tag carrying the app's
 * `d` identifier, so we query the publisher's releases and keep those whose
 * `i` tag matches `appIdentifier` (or, lacking an `i` tag, whose `d` tag is
 * prefixed `appIdentifier@…`). Scoped to the app author — releases are
 * addressable events, so the `d`/`i` tags alone are not a trust boundary.
 */
export function useZapstoreReleases(
  pubkey: string | undefined,
  appIdentifier: string | undefined,
  limit = 30,
) {
  const { nostr } = useNostr();

  return useQuery<ZapstoreRelease[]>({
    queryKey: ['zapstore-releases-for-app', pubkey, appIdentifier, limit],
    queryFn: async ({ signal }) => {
      const filter: NostrFilter = {
        kinds: [ZAPSTORE_RELEASE_KIND],
        authors: [pubkey!],
        '#i': [appIdentifier!],
        limit,
      };

      let events = await nostr
        .query([filter], { signal: AbortSignal.any([signal, AbortSignal.timeout(6000)]) })
        .catch(() => [] as NostrEvent[]);

      // Some publishers omit the `i` tag and only encode the app in the `d`
      // tag (`app-id@version`). Fall back to an author-scoped query and match
      // the `d` prefix client-side.
      if (events.length === 0) {
        const all = await nostr
          .query(
            [{ kinds: [ZAPSTORE_RELEASE_KIND], authors: [pubkey!], limit: 100 }],
            { signal: AbortSignal.any([signal, AbortSignal.timeout(6000)]) },
          )
          .catch(() => [] as NostrEvent[]);
        events = all.filter((ev) => {
          const d = ev.tags.find(([n]) => n === 'd')?.[1] ?? '';
          return d === appIdentifier || d.startsWith(`${appIdentifier}@`);
        });
      }

      // Keep the latest event per (pubkey, d) address.
      const latest = new Map<string, NostrEvent>();
      for (const ev of events) {
        if (!isValidRelease(ev)) continue;
        const d = ev.tags.find(([n]) => n === 'd')?.[1] ?? '';
        const key = `${ev.pubkey}:${d}`;
        const prev = latest.get(key);
        if (!prev || ev.created_at > prev.created_at) latest.set(key, ev);
      }

      return Array.from(latest.values())
        .map(parseRelease)
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, limit);
    },
    enabled: Boolean(pubkey && appIdentifier),
    staleTime: 60 * 1000,
  });
}

/**
 * Fetch a single Zapstore release (kind 30063) by its (pubkey, d-tag) address.
 * The author filter is mandatory — the `d` tag alone is not a trust boundary.
 */
export function useZapstoreRelease(pubkey: string | undefined, identifier: string | undefined) {
  const { nostr } = useNostr();

  return useQuery<ZapstoreRelease | null>({
    queryKey: ['zapstore-release', pubkey, identifier],
    queryFn: async ({ signal }) => {
      const events = await nostr
        .query(
          [{ kinds: [ZAPSTORE_RELEASE_KIND], authors: [pubkey!], '#d': [identifier!], limit: 5 }],
          { signal: AbortSignal.any([signal, AbortSignal.timeout(6000)]) },
        )
        .catch(() => [] as NostrEvent[]);

      const latest = events
        .filter(isValidRelease)
        .sort((a, b) => b.created_at - a.created_at)[0];
      return latest ? parseRelease(latest) : null;
    },
    enabled: Boolean(pubkey && identifier),
    staleTime: 60 * 1000,
  });
}

/**
 * Fetch the downloadable assets (kind 3063) for a release by their event ids,
 * scoped to the release author. These carry the actual download URLs (APKs and
 * other binaries), MIME type, size, and filename. Returned newest-first.
 */
export function useZapstoreAssets(pubkey: string | undefined, assetIds: string[]) {
  const { nostr } = useNostr();
  const ids = Array.from(new Set(assetIds.filter(Boolean)));

  return useQuery<ZapstoreAsset[]>({
    queryKey: ['zapstore-assets', pubkey, [...ids].sort()],
    queryFn: async ({ signal }) => {
      const events = await nostr
        .query(
          // Author-scope the lookup: the `e` tag points at an event id, but
          // constraining on the release author keeps a malicious event from
          // injecting a download link onto someone else's release.
          [{ kinds: [ZAPSTORE_ASSET_KIND], ids, authors: [pubkey!] }],
          { signal: AbortSignal.any([signal, AbortSignal.timeout(6000)]) },
        )
        .catch(() => [] as NostrEvent[]);

      return events
        .filter((ev) => ev.kind === ZAPSTORE_ASSET_KIND)
        .sort((a, b) => b.created_at - a.created_at)
        .map(parseAsset)
        .filter((asset) => asset.urls.length > 0);
    },
    enabled: Boolean(pubkey && ids.length > 0),
    staleTime: 5 * 60 * 1000,
  });
}

/** A Zapstore app listing paired with its latest release, for browse grids. */
export interface ReleaseListing {
  app: ZapstoreApp;
  /** Latest release (kind 30063) for the app, when one was found. */
  release?: ZapstoreRelease;
}

/**
 * Browse Zapstore app listings (kind 32267), optionally filtered to a single
 * category `t` tag, each paired with its latest release.
 *
 * Listings are indexed by their single-letter `t` tags, so the tag filter runs
 * at the relay. Releases are then fetched in one combined query keyed by the
 * apps' identifiers (`#i`) and scoped to the listing authors.
 */
export function useZapstoreReleasesByTag(tag: string | undefined, limit = 60) {
  const { nostr } = useNostr();
  const normalizedTag = tag?.trim().toLowerCase() || undefined;

  return useQuery<ReleaseListing[]>({
    queryKey: ['zapstore-listings-by-tag', normalizedTag, limit],
    queryFn: async ({ signal }) => {
      const timeout = AbortSignal.any([signal, AbortSignal.timeout(8000)]);

      const filter: NostrFilter = { kinds: [ZAPSTORE_APP_KIND], limit };
      if (normalizedTag) filter['#t'] = [normalizedTag];

      const events = await nostr
        .query([filter], { signal: timeout })
        .catch(() => [] as NostrEvent[]);

      // Latest listing per (pubkey, d).
      const latest = new Map<string, NostrEvent>();
      for (const ev of events) {
        if (ev.kind !== ZAPSTORE_APP_KIND) continue;
        const d = ev.tags.find(([n]) => n === 'd')?.[1];
        if (!d) continue;
        const key = `${ev.pubkey}:${d}`;
        const prev = latest.get(key);
        if (!prev || ev.created_at > prev.created_at) latest.set(key, ev);
      }

      const apps = Array.from(latest.values())
        .map(parseZapstoreApp)
        .filter((a): a is ZapstoreApp => a !== null)
        .filter((a) => a.pubkey !== ZAPSTORE_INDEXER_PUBKEY)
        .sort((a, b) => b.createdAt - a.createdAt);

      if (apps.length === 0) return [];

      // Fetch the latest release per app in one combined, author-scoped query.
      const appIds = Array.from(new Set(apps.map((a) => a.identifier)));
      const authors = Array.from(new Set(apps.map((a) => a.pubkey)));

      const releaseEvents = await nostr
        .query(
          [{ kinds: [ZAPSTORE_RELEASE_KIND], authors, '#i': appIds, limit: appIds.length * 4 }],
          { signal: AbortSignal.any([signal, AbortSignal.timeout(6000)]) },
        )
        .catch(() => [] as NostrEvent[]);

      // Keep the newest valid release per (pubkey, app identifier).
      const latestRelease = new Map<string, ZapstoreRelease>();
      for (const ev of releaseEvents) {
        if (!isValidRelease(ev)) continue;
        const release = parseRelease(ev);
        if (!release.appIdentifier) continue;
        const key = `${release.pubkey}:${release.appIdentifier}`;
        const prev = latestRelease.get(key);
        if (!prev || release.createdAt > prev.createdAt) latestRelease.set(key, release);
      }

      return apps.map((app) => ({
        app,
        release: latestRelease.get(`${app.pubkey}:${app.identifier}`),
      }));
    },
    staleTime: 5 * 60 * 1000,
  });
}
