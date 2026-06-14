import type { NostrFilter } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { DITTO_RELAY } from '@/lib/appRelays';
import { useAppContext } from '@/hooks/useAppContext';

/** Issue a NIP-45 COUNT query against the configured stats relay and return the count. */
export function useCount(filters: NostrFilter[], opts?: { enabled?: boolean }) {
  const { nostr } = useNostr();
  const { config } = useAppContext();
  const statsRelay = config.statsRelay || DITTO_RELAY;

  return useQuery({
    queryKey: ['nostr', 'count', JSON.stringify(filters), statsRelay],
    queryFn: async ({ signal }) => {
      const relay = nostr.relay(statsRelay);
      if (!relay.count) {
        throw new Error('Relay does not support NIP-45 COUNT');
      }
      const result = await relay.count(filters, { signal });
      return result.count;
    },
    enabled: (opts?.enabled ?? true) && !!statsRelay,
    staleTime: 5 * 60 * 1000,
  });
}
