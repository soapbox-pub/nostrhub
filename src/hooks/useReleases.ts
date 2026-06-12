import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';
import { useAppContext } from '@/hooks/useAppContext';
import {
  ZAPSTORE_APP_KIND,
  ZAPSTORE_RELAY,
  ZAPSTORE_RELEASE_KIND,
  isValidRelease,
  parseRelease,
  parseZapstoreApp,
  type ZapstoreApp,
  type ZapstoreRelease,
} from '@/lib/zapstore';

export interface UseReleasesOptions {
  /** Restrict to these author pubkeys (hex) — e.g. the community author set. */
  authors?: string[];
  limit?: number;
  /** Skip the query (e.g. while the author set is still resolving). */
  enabled?: boolean;
}

export interface ReleaseWithApp {
  release: ZapstoreRelease;
  /** Linked kind 32267 app metadata, if found. */
  app?: ZapstoreApp;
}

/**
 * Discover Zapstore software releases (kind 30063), newest first.
 *
 * Zapstore traffic lives primarily on the dedicated Zapstore relay, so the
 * query fans out to it alongside the user's read relays. Results are scoped to
 * the community author set when one is provided — releases are addressable
 * events, so the `d` tag alone is not a trust boundary and we must constrain on
 * authors. Keeps only the latest release per (author, identifier) address, then
 * fetches the linked app listings (kind 32267) for display.
 */
export function useReleases(options: UseReleasesOptions = {}) {
  const { nostr } = useNostr();
  const { config } = useAppContext();
  const { authors, limit = 50, enabled = true } = options;

  return useQuery<ReleaseWithApp[]>({
    queryKey: ['zapstore-releases', authors ? [...authors].sort() : null, limit],
    queryFn: async ({ signal }) => {
      const timeout = AbortSignal.any([signal, AbortSignal.timeout(8000)]);

      const readRelays = config.relayMetadata.relays
        .filter((r) => r.read)
        .map((r) => r.url);
      const urls = new Set<string>([ZAPSTORE_RELAY, ...readRelays]);

      const filter: NostrFilter = { kinds: [ZAPSTORE_RELEASE_KIND], limit };
      if (authors && authors.length > 0) filter.authors = authors;

      const events = await nostr
        .group([...urls].slice(0, 10))
        .query([filter], { signal: timeout })
        .catch(() => [] as NostrEvent[]);

      // Addressable events: keep only the latest per (pubkey, d) address.
      const latest = new Map<string, NostrEvent>();
      for (const ev of events) {
        if (!isValidRelease(ev)) continue;
        const d = ev.tags.find(([n]) => n === 'd')?.[1] ?? '';
        const key = `${ev.pubkey}:${d}`;
        const prev = latest.get(key);
        if (!prev || ev.created_at > prev.created_at) latest.set(key, ev);
      }

      const releases = Array.from(latest.values())
        .map(parseRelease)
        .sort((a, b) => b.createdAt - a.createdAt);

      if (releases.length === 0) return [];

      // Fetch the linked app listings (kind 32267) for the apps these releases
      // belong to, scoped to the same authors. One combined query keyed by the
      // app identifiers carried on the releases' `i` tags.
      const appIds = Array.from(
        new Set(releases.map((r) => r.appIdentifier).filter((id): id is string => Boolean(id))),
      );
      const releaseAuthors = Array.from(new Set(releases.map((r) => r.pubkey)));

      const apps = new Map<string, ZapstoreApp>();
      if (appIds.length > 0) {
        const appEvents = await nostr
          .group([...urls].slice(0, 10))
          .query(
            [{ kinds: [ZAPSTORE_APP_KIND], authors: releaseAuthors, '#d': appIds }],
            { signal: AbortSignal.any([signal, AbortSignal.timeout(6000)]) },
          )
          .catch(() => [] as NostrEvent[]);

        for (const ev of appEvents) {
          const app = parseZapstoreApp(ev);
          if (!app) continue;
          const key = `${app.pubkey}:${app.identifier}`;
          const prev = apps.get(key);
          if (!prev) apps.set(key, app);
        }
      }

      return releases.map((release) => ({
        release,
        app: release.appIdentifier
          ? apps.get(`${release.pubkey}:${release.appIdentifier}`)
          : undefined,
      }));
    },
    enabled: enabled && (!authors || authors.length > 0),
    staleTime: 5 * 60 * 1000,
  });
}
