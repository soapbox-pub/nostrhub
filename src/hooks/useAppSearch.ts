import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';
import { SEARCH_RELAYS } from '@/lib/searchRelays';
import {
  APP_CATEGORY_TAGS,
  APP_HANDLER_KIND,
  dedupeAppEvents,
  hasFullAppMetadata,
  type AppInfo,
} from '@/lib/apps';

/**
 * NIP-50 full-text search over kind 31990 app listings, sent to the dedicated
 * search relay group (general pool relays ignore the `search` filter field).
 * The relays match against the app's content metadata (name, about, etc.).
 *
 * When the query is the bare browse sentinel `'sort:hot'` and the search relay
 * returns fewer than 50 results, recent events are fetched from the general
 * pool in parallel and appended (deduped) as a backfill.
 *
 * Returns the latest revision per app address, restricted to listings with
 * complete metadata, preserving the relay's relevance ranking.
 */
export function useAppSearch(query: string) {
  const { nostr } = useNostr();
  const search = query.trim();
  const isBrowse = search === 'sort:hot';

  return useQuery<AppInfo[]>({
    queryKey: ['app-search', search],
    queryFn: async ({ signal }) => {
      const timeout = AbortSignal.any([signal, AbortSignal.timeout(8000)]);

      // Always fire the search query. For browse, also fire the recency
      // backfill in parallel so there's no extra round-trip if we need it.
      const searchPromise = nostr
        .group(SEARCH_RELAYS)
        .query([{ kinds: [APP_HANDLER_KIND], search, limit: 50 }], { signal: timeout })
        .catch(() => [] as NostrEvent[]);

      const backfillPromise = isBrowse
        ? nostr
            .query(
              [
                { kinds: [APP_HANDLER_KIND], limit: 100 },
                { kinds: [APP_HANDLER_KIND], '#t': APP_CATEGORY_TAGS, limit: 100 },
              ],
              { signal: timeout },
            )
            .catch(() => [] as NostrEvent[])
        : Promise.resolve([] as NostrEvent[]);

      const [searchEvents, backfillEvents] = await Promise.all([searchPromise, backfillPromise]);

      // Build ordered index from search results.
      const order = new Map<string, number>();
      for (const [i, ev] of searchEvents.entries()) {
        const d = ev.tags.find(([n]) => n === 'd')?.[1];
        if (!d) continue;
        const key = `${APP_HANDLER_KIND}:${ev.pubkey}:${d}`;
        if (!order.has(key)) order.set(key, i);
      }

      const hotResults = dedupeAppEvents(searchEvents);
      const hotAddresses = new Set(hotResults.map((a) => a.address));

      if (isBrowse && hotResults.filter(hasFullAppMetadata).length < 50) {
        const recent = dedupeAppEvents(backfillEvents)
          .filter((a) => !hotAddresses.has(a.address))
          .sort((a, b) => b.createdAt - a.createdAt);

        return [
          ...hotResults.sort((a, b) => (order.get(a.address) ?? 0) - (order.get(b.address) ?? 0)),
          ...recent,
        ];
      }

      return hotResults.sort((a, b) => (order.get(a.address) ?? 0) - (order.get(b.address) ?? 0));
    },
    enabled: search.length > 0,
    staleTime: 60 * 1000,
    retry: 1,
  });
}
