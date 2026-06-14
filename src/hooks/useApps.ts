import { useNostr } from '@nostrify/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';
import {
  APP_CATEGORY_TAGS,
  APP_HANDLER_KIND,
  dedupeAppEvents,
  hasFullAppMetadata,
  type AppInfo,
} from '@/lib/apps';

export interface UseAppsOptions {
  /** Restrict to these author pubkeys (hex). */
  authors?: string[];
  /** Per-filter result limit. */
  limit?: number;
  /**
   * Require full metadata (name, picture, about, website) so DVM handlers and
   * bots don't pollute the directory. Defaults to true; set false when showing
   * a specific author's own listings (e.g. their profile page).
   */
  requireFullMetadata?: boolean;
  enabled?: boolean;
}

/**
 * Discover Nostr apps via NIP-89 handler events (kind 31990), newest first.
 *
 * Unscoped browsing combines a broad recency filter with a `#t` category-tag
 * filter in one REQ, since many app listings only surface through their tags.
 * Author-scoped queries (profile pages, expert curation) use a single filter.
 */
export function useApps(options: UseAppsOptions = {}) {
  const { nostr } = useNostr();
  const { authors, limit = 300, requireFullMetadata = true, enabled = true } = options;

  return useQuery<AppInfo[]>({
    queryKey: [
      'apps',
      authors ? [...authors].sort() : null,
      limit,
      requireFullMetadata,
    ],
    queryFn: async ({ signal }) => {
      const timeout = AbortSignal.any([signal, AbortSignal.timeout(10000)]);

      let filters: NostrFilter[];
      if (authors && authors.length > 0) {
        filters = [{ kinds: [APP_HANDLER_KIND], authors, limit }];
      } else {
        filters = [
          { kinds: [APP_HANDLER_KIND], limit },
          { kinds: [APP_HANDLER_KIND], '#t': APP_CATEGORY_TAGS, limit },
        ];
      }

      const events = await nostr
        .query(filters, { signal: timeout })
        .catch(() => [] as NostrEvent[]);

      const apps = dedupeAppEvents(events);
      return requireFullMetadata ? apps.filter(hasFullAppMetadata) : apps;
    },
    enabled: enabled && (!authors || authors.length > 0),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Fetch a single app listing by its (pubkey, d-tag) address. The author filter
 * is mandatory — the `d` tag alone is not a trust boundary for addressable
 * events.
 */
export function useApp(pubkey: string | undefined, identifier: string | undefined) {
  const { nostr } = useNostr();
  const queryClient = useQueryClient();

  return useQuery<AppInfo | null>({
    queryKey: ['app', pubkey, identifier],
    queryFn: async ({ signal, queryKey }) => {
      const events = await nostr.query(
        [
          {
            kinds: [APP_HANDLER_KIND],
            authors: [pubkey!],
            '#d': [identifier!],
            limit: 5,
          },
        ],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) },
      );

      const fetched = dedupeAppEvents(events)[0] ?? null;
      // Relays may not have indexed a freshly-published listing yet. Don't let
      // an empty response clobber an optimistically-seeded entry — keep the
      // cached app (e.g. from publish) until the relay actually has the event.
      if (!fetched) {
        return queryClient.getQueryData<AppInfo | null>(queryKey) ?? null;
      }
      return fetched;
    },
    enabled: Boolean(pubkey && identifier),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Find the NIP-89 app listing (kind 31990) that a publisher's Zapstore app
 * (kind 32267, identified by `appIdentifier`) is referenced by — the nexus
 * that ties a Zapstore release to its repos, NIPs, and handled kinds.
 *
 * A 31990 event references its Zapstore listing via an `a` tag pointing at the
 * `32267:<pubkey>:<d>` coordinate. The query is author-scoped: a listing is
 * only trusted to describe a Zapstore app published by the same author, so
 * nobody can hijack the association by referencing someone else's coordinate.
 */
export function useAppForZapstore(
  pubkey: string | undefined,
  appIdentifier: string | undefined,
) {
  const { nostr } = useNostr();

  return useQuery<AppInfo | null>({
    queryKey: ['app-for-zapstore', pubkey, appIdentifier],
    queryFn: async ({ signal }) => {
      const coord = `32267:${pubkey}:${appIdentifier}`;
      const events = await nostr
        .query(
          [{ kinds: [APP_HANDLER_KIND], authors: [pubkey!], '#a': [coord] }],
          { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) },
        )
        .catch(() => [] as NostrEvent[]);

      // Only honour a listing whose own zapstore ref points back at the app
      // author's coordinate, mirroring the trust rule used elsewhere.
      const apps = dedupeAppEvents(events).filter((app) =>
        app.zapstoreRefs.some((ref) => ref.pubkey === app.pubkey && ref.address === coord),
      );
      return apps[0] ?? null;
    },
    enabled: Boolean(pubkey && appIdentifier),
    staleTime: 5 * 60 * 1000,
  });
}
