import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';
import { SEARCH_RELAYS } from '@/lib/searchRelays';

export interface UseNostrSearchOptions {
  /** Human-readable NIP-50 search strings; each becomes its own filter. */
  searches: string[];
  kinds: number[];
  /** Restrict results to the last N days. */
  sinceDays?: number;
  /** Per-search result limit. */
  limit?: number;
  enabled?: boolean;
}

/**
 * NIP-50 full-text search across the dedicated search relay group
 * (relay.ditto.pub + relay.dreamith.to — most pool relays ignore the `search`
 * filter field). Results are deduplicated and kind-checked, preserving the
 * relay's result ranking (e.g. `sort:hot`) instead of re-sorting by time.
 */
export function useNostrSearch(options: UseNostrSearchOptions) {
  const { nostr } = useNostr();
  const { searches, kinds, sinceDays, limit = 20, enabled = true } = options;

  return useQuery<NostrEvent[]>({
    queryKey: ['nostr-search', kinds, searches, sinceDays ?? null, limit],
    queryFn: async ({ signal }) => {
      const since =
        sinceDays !== undefined
          ? Math.floor(Date.now() / 1000) - sinceDays * 86400
          : undefined;

      const filters: NostrFilter[] = searches.map((search) => {
        const filter: NostrFilter = { kinds, search, limit };
        if (since !== undefined) filter.since = since;
        return filter;
      });

      const group = nostr.group(SEARCH_RELAYS);
      const events = await group.query(filters, {
        signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
      });

      const seen = new Set<string>();
      return events.filter((ev) => {
        if (!kinds.includes(ev.kind) || seen.has(ev.id)) return false;
        if (since !== undefined && ev.created_at < since) return false;
        seen.add(ev.id);
        return true;
      });
    },
    enabled: enabled && searches.length > 0,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}
