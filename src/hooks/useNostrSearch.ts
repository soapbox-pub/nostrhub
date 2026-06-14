import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';
import { SEARCH_RELAYS } from '@/lib/searchRelays';
import { useAppContext } from '@/hooks/useAppContext';

export interface UseNostrSearchOptions {
  /** Human-readable NIP-50 search strings; each becomes its own filter. */
  searches: string[];
  kinds: number[];
  /** Restrict results to these author pubkeys (hex). */
  authors?: string[];
  /** Restrict results to the last N days. */
  sinceDays?: number;
  /** Per-search result limit. */
  limit?: number;
  /**
   * Drop replies (events carrying an `e` tag). Appends the `-tag:e` NIP-50
   * token (honored by Ditto) so the relay omits replies, and also enforces it
   * client-side for relays that ignore the token.
   */
  excludeReplies?: boolean;
  enabled?: boolean;
}

/**
 * NIP-50 full-text search across the dedicated search relay group
 * (relay.ditto.pub + relay.dreamith.to — most pool relays ignore the `search`
 * filter field). Results are deduplicated and kind-checked, preserving the
 * relay's result ranking (e.g. `sort:hot`) instead of re-sorting by time.
 *
 * Pass `authors` to scope the search to a trusted set of pubkeys (e.g. the
 * community author set); it is applied both as a relay-side `authors` filter
 * and as a client-side guard. Pass `excludeReplies` to drop `e`-tagged replies
 * (relay-side via `-tag:e`, plus a client-side guard) so the limit is spent on
 * top-level posts rather than replies the caller would discard anyway.
 */
export function useNostrSearch(options: UseNostrSearchOptions) {
  const { nostr } = useNostr();
  const { config } = useAppContext();
  const searchRelays = config.searchRelays.length > 0 ? config.searchRelays : SEARCH_RELAYS;
  const { searches, kinds, authors, sinceDays, limit = 20, excludeReplies = false, enabled = true } = options;

  return useQuery<NostrEvent[]>({
    queryKey: [
      'nostr-search',
      kinds,
      searches,
      authors ? [...authors].sort() : null,
      sinceDays ?? null,
      limit,
      excludeReplies,
      searchRelays,
    ],
    queryFn: async ({ signal }) => {
      const since =
        sinceDays !== undefined
          ? Math.floor(Date.now() / 1000) - sinceDays * 86400
          : undefined;

      const hasAuthors = authors !== undefined && authors.length > 0;
      const authorSet = hasAuthors ? new Set(authors) : undefined;

      const filters: NostrFilter[] = searches.map((search) => {
        const term = excludeReplies ? `${search} -tag:e` : search;
        const filter: NostrFilter = { kinds, search: term, limit };
        if (since !== undefined) filter.since = since;
        if (hasAuthors) filter.authors = authors;
        return filter;
      });

      const group = nostr.group(searchRelays);
      const events = await group.query(filters, {
        signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
      });

      const seen = new Set<string>();
      return events.filter((ev) => {
        if (!kinds.includes(ev.kind) || seen.has(ev.id)) return false;
        if (since !== undefined && ev.created_at < since) return false;
        if (authorSet && !authorSet.has(ev.pubkey)) return false;
        if (excludeReplies && ev.tags.some(([n]) => n === 'e')) return false;
        seen.add(ev.id);
        return true;
      });
    },
    enabled: enabled && searches.length > 0,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}
