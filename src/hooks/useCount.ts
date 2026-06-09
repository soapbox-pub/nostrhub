import type { NostrFilter } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { DITTO_RELAY } from '@/lib/appRelays';

/** Issue a NIP-45 COUNT query against the Ditto relay and return the count. */
export function useCount(filters: NostrFilter[], opts?: { enabled?: boolean }) {
  const { nostr } = useNostr();

  return useQuery({
    queryKey: ['nostr', 'count', JSON.stringify(filters)],
    queryFn: async ({ signal }) => {
      const relay = nostr.relay(DITTO_RELAY);
      if (!relay.count) {
        throw new Error('Relay does not support NIP-45 COUNT');
      }
      const result = await relay.count(filters, { signal });
      return result.count;
    },
    enabled: opts?.enabled ?? true,
    staleTime: 5 * 60 * 1000,
  });
}
