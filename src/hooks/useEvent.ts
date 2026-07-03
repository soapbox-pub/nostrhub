import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';
import { useAppContext } from '@/hooks/useAppContext';
import { getEffectiveRelays } from '@/lib/appRelays';
import { GIT_DISCOVERY_RELAYS } from '@/lib/git';
import { SEARCH_RELAYS } from '@/lib/searchRelays';

function normalizeRelayUrl(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'wss:' && parsed.protocol !== 'ws:') return undefined;
    return parsed.href;
  } catch {
    return undefined;
  }
}

/**
 * Fetch a single event by id, kind unknown.
 *
 * Queries the user's read relays, any NIP-19 relay hints, and the well-known
 * git discovery relays together (NIP-34 traffic rarely reaches general-purpose
 * relays), then falls back to the NIP-50 search relays. Used by the `/:nip19`
 * resolver to route `nevent1`/`note1` links to their canonical page.
 */
export function useEvent(id: string, relayHints: string[] = []) {
  const { nostr } = useNostr();
  const { config } = useAppContext();
  const searchRelays = config.searchRelays.length > 0 ? config.searchRelays : SEARCH_RELAYS;

  return useQuery<NostrEvent | null>({
    queryKey: ['event', id, [...relayHints].sort().join(',')],
    queryFn: async ({ signal }) => {
      const readRelays = getEffectiveRelays(
        config.relayMetadata,
        config.useAppRelays,
        config.useUserRelays,
      ).relays
        .filter((r) => r.read)
        .map((r) => r.url);

      const urls = new Set<string>();
      for (const url of [...relayHints, ...readRelays, ...GIT_DISCOVERY_RELAYS]) {
        const normalized = normalizeRelayUrl(url);
        if (normalized) urls.add(normalized);
      }

      const filter = { ids: [id], limit: 1 };
      const opts = { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) };

      const fromPool = await nostr.group([...urls].slice(0, 12)).query([filter], opts);
      if (fromPool.length > 0) return fromPool[0];

      // Fall back to the search relays, since events discovered via NIP-50
      // may only live there.
      const fromSearch = await nostr.group(searchRelays).query([filter], opts);
      return fromSearch[0] ?? null;
    },
    enabled: Boolean(id),
    staleTime: 60 * 1000,
    retry: 1,
  });
}
