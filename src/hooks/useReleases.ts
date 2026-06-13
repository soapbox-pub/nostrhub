import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';
import { useAppContext } from '@/hooks/useAppContext';
import { APP_HANDLER_KIND, dedupeAppEvents } from '@/lib/apps';
import {
  ZAPSTORE_APP_KIND,
  ZAPSTORE_RELAY,
  ZAPSTORE_RELEASE_KIND,
  isValidRelease,
  parseRelease,
  parseZapstoreApp,
  releaseDisplayName,
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
  /**
   * bech32 naddr of the NIP-89 app listing (kind 31990) that references this
   * release's Zapstore app, when one exists. Lets the release card link to the
   * in-app listing instead of the external Zapstore page.
   */
  appNaddr?: string;
}

/**
 * Discover Zapstore software releases (kind 30063), newest first.
 *
 * Zapstore traffic lives primarily on the dedicated Zapstore relay, so the
 * query fans out to it alongside the user's read relays. Results are scoped to
 * the community author set when one is provided — releases are addressable
 * events, so the `d` tag alone is not a trust boundary and we must constrain on
 * authors.
 *
 * A single app publishes a separate kind 30063 per version (the `d` tag is
 * usually `app-id@version`), so the relay-side address dedupe still leaves
 * multiple releases per piece of software. We over-fetch (4× the requested
 * limit, capped) and then collapse to the single latest release per software
 * before truncating to `limit`.
 *
 * Each release is then enriched with its kind 32267 app metadata and, when a
 * NIP-89 handler listing (kind 31990) references that Zapstore app, the
 * listing's naddr so the card can link to the in-app app page.
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

      // Over-fetch so collapsing to one release per app still yields enough
      // distinct software to fill the requested limit.
      const fetchLimit = Math.min(limit * 4, 500);
      const filter: NostrFilter = { kinds: [ZAPSTORE_RELEASE_KIND], limit: fetchLimit };
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

      const allReleases = Array.from(latest.values())
        .map(parseRelease)
        .sort((a, b) => b.createdAt - a.createdAt);

      // Collapse to the latest release per software. Key by (author, app) so
      // every version of the same app folds into one entry; releases without an
      // `i` tag fall back to the display name derived from the `d` tag.
      const latestPerApp = new Map<string, ZapstoreRelease>();
      for (const release of allReleases) {
        const softwareKey = `${release.pubkey}:${release.appIdentifier ?? releaseDisplayName(release)}`;
        const prev = latestPerApp.get(softwareKey);
        if (!prev || release.createdAt > prev.createdAt) latestPerApp.set(softwareKey, release);
      }

      const releases = Array.from(latestPerApp.values())
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, limit);

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

      // Link releases to NIP-89 app listings (kind 31990). A 31990 event
      // references its Zapstore listing via an `a` tag pointing at the
      // `32267:<pubkey>:<d>` coordinate, so we query 31990 events that reference
      // the Zapstore coordinates of the apps these releases belong to, then map
      // each coordinate back to the listing's naddr.
      const zapstoreCoords = appIds.length > 0
        ? Array.from(
            new Set(
              releases
                .filter((r) => r.appIdentifier)
                .map((r) => `${ZAPSTORE_APP_KIND}:${r.pubkey}:${r.appIdentifier}`),
            ),
          )
        : [];

      const naddrByCoord = new Map<string, string>();
      if (zapstoreCoords.length > 0) {
        const handlerEvents = await nostr
          .group([...urls].slice(0, 10))
          .query(
            // Scope to the release authors: a 31990 listing is only trusted to
            // describe a Zapstore app published by the same author. Without the
            // author filter anyone could publish a listing referencing someone
            // else's `32267:<pubkey>:<d>` coordinate and hijack the card link.
            [{ kinds: [APP_HANDLER_KIND], authors: releaseAuthors, '#a': zapstoreCoords }],
            { signal: AbortSignal.any([signal, AbortSignal.timeout(6000)]) },
          )
          .catch(() => [] as NostrEvent[]);

        for (const app of dedupeAppEvents(handlerEvents)) {
          for (const ref of app.zapstoreRefs) {
            // The referenced Zapstore coordinate embeds the app author's pubkey;
            // only honour it when that matches the listing's own author so the
            // link stays within a single author's events.
            if (ref.pubkey !== app.pubkey) continue;
            if (!naddrByCoord.has(ref.address)) naddrByCoord.set(ref.address, app.naddr);
          }
        }
      }

      return releases.map((release) => ({
        release,
        app: release.appIdentifier
          ? apps.get(`${release.pubkey}:${release.appIdentifier}`)
          : undefined,
        appNaddr: release.appIdentifier
          ? naddrByCoord.get(`${ZAPSTORE_APP_KIND}:${release.pubkey}:${release.appIdentifier}`)
          : undefined,
      }));
    },
    enabled: enabled && (!authors || authors.length > 0),
    staleTime: 5 * 60 * 1000,
  });
}
