import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';
import { SEARCH_RELAYS } from '@/lib/searchRelays';
import {
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
 * Returns the latest revision per app address, restricted to listings with
 * complete metadata, preserving the relay's relevance ranking.
 */
export function useAppSearch(query: string) {
  const { nostr } = useNostr();
  const search = query.trim();

  return useQuery<AppInfo[]>({
    queryKey: ['app-search', search],
    queryFn: async ({ signal }) => {
      const events = await nostr
        .group(SEARCH_RELAYS)
        .query([{ kinds: [APP_HANDLER_KIND], search, limit: 50 }], {
          signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
        })
        .catch(() => [] as NostrEvent[]);

      // Preserve relay relevance order: rank addresses by first appearance,
      // then sort the deduped results back into that order.
      const order = new Map<string, number>();
      for (const [i, ev] of events.entries()) {
        const d = ev.tags.find(([n]) => n === 'd')?.[1];
        if (!d) continue;
        const key = `${APP_HANDLER_KIND}:${ev.pubkey}:${d}`;
        if (!order.has(key)) order.set(key, i);
      }

      return dedupeAppEvents(events)
        .filter(hasFullAppMetadata)
        .sort((a, b) => (order.get(a.address) ?? 0) - (order.get(b.address) ?? 0));
    },
    enabled: search.length > 0,
    staleTime: 60 * 1000,
    retry: 1,
  });
}
