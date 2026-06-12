import { useQuery } from '@tanstack/react-query';

const RELAY_DISCOVERY_URL =
  'https://raw.githubusercontent.com/permissionlesstech/georelays/refs/heads/main/relay_discovery_results.json';

interface RelayDiscoveryResults {
  statistics?: {
    functioning_relays_count?: number;
  };
}

/**
 * Fetch the number of functioning relays on the Nostr network from the
 * permissionlesstech/georelays discovery dataset.
 *
 * Returns the `statistics.functioning_relays_count` field from the published
 * `relay_discovery_results.json`.
 */
export function useRelayCount() {
  return useQuery({
    queryKey: ['relay-count'],
    queryFn: async (c): Promise<number> => {
      const res = await fetch(RELAY_DISCOVERY_URL, { signal: c.signal });
      if (!res.ok) {
        throw new Error(`Failed to fetch relay discovery results: ${res.status}`);
      }
      const data: RelayDiscoveryResults = await res.json();
      const count = data.statistics?.functioning_relays_count;
      if (typeof count !== 'number') {
        throw new Error('functioning_relays_count missing from results');
      }
      return count;
    },
    staleTime: 60 * 60 * 1000,
  });
}
