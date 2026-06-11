import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
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

  return useQuery<AppInfo | null>({
    queryKey: ['app', pubkey, identifier],
    queryFn: async ({ signal }) => {
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

      return dedupeAppEvents(events)[0] ?? null;
    },
    enabled: Boolean(pubkey && identifier),
    staleTime: 5 * 60 * 1000,
  });
}
