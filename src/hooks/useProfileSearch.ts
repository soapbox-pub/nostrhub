import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import {
  NSchema as n,
  type NostrEvent,
  type NostrFilter,
  type NostrMetadata,
} from '@nostrify/nostrify';

import { DITTO_RELAY } from '@/lib/appRelays';

export interface ProfileSearchResult {
  pubkey: string;
  metadata: NostrMetadata;
}

/**
 * NIP-50 profile search: look up kind-0 metadata events by name on the Ditto
 * search relay, so a user can find someone by name rather than pasting a
 * pubkey. The caller is responsible for debouncing the query.
 */
export function useProfileSearch(query: string) {
  const { nostr } = useNostr();
  const trimmed = query.trim();

  return useQuery<ProfileSearchResult[]>({
    queryKey: ['profileSearch', trimmed],
    queryFn: async ({ signal }) => {
      const filter: NostrFilter = { kinds: [0], search: trimmed, limit: 8 };
      const events = await nostr.group([DITTO_RELAY]).query([filter], {
        signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
      });

      // Keep the newest kind-0 per pubkey, preserving the relay's ranking.
      const latest = new Map<string, NostrEvent>();
      for (const ev of events) {
        if (ev.kind !== 0) continue;
        const prev = latest.get(ev.pubkey);
        if (!prev || ev.created_at > prev.created_at) latest.set(ev.pubkey, ev);
      }

      const results: ProfileSearchResult[] = [];
      for (const ev of latest.values()) {
        try {
          results.push({ pubkey: ev.pubkey, metadata: n.json().pipe(n.metadata()).parse(ev.content) });
        } catch {
          results.push({ pubkey: ev.pubkey, metadata: {} });
        }
      }
      return results;
    },
    enabled: trimmed.length > 0,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}
