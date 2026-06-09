import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrFilter } from '@nostrify/nostrify';
import { CUSTOM_NIP_KIND, isValidCustomNip, parseCustomNip, type CustomNip } from '@/lib/nips';

/**
 * Search community-authored NIPs (kind 30817) via NIP-50 full-text search.
 *
 * The query is routed (by `NostrProvider`'s `reqRouter`) to relays that
 * implement NIP-50 — currently relay.ditto.pub and relay.dreamith.to. We use
 * Ditto's `autocomplete:true` search extension so partial words match while the
 * user is still typing.
 */
export function useNipSearch(query: string, limit = 20) {
  const { nostr } = useNostr();
  const trimmed = query.trim();

  return useQuery<CustomNip[]>({
    queryKey: ['nip-search', trimmed, limit],
    queryFn: async ({ signal }) => {
      if (!trimmed) return [];

      const filter: NostrFilter = {
        kinds: [CUSTOM_NIP_KIND],
        search: `autocomplete:true ${trimmed}`,
        limit,
      };

      const events = await nostr.query([filter], {
        signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]),
      });

      // Keep only the latest event per (author, d) address.
      const latest = new Map<string, (typeof events)[number]>();
      for (const ev of events) {
        if (!isValidCustomNip(ev)) continue;
        const d = ev.tags.find(([n]) => n === 'd')?.[1] ?? '';
        const key = `${ev.pubkey}:${d}`;
        const prev = latest.get(key);
        if (!prev || ev.created_at > prev.created_at) latest.set(key, ev);
      }

      // Relays return search results already ranked by relevance; preserve the
      // first-seen order rather than re-sorting by date.
      return Array.from(latest.values()).map(parseCustomNip);
    },
    enabled: trimmed.length > 0,
    staleTime: 30 * 1000,
  });
}
