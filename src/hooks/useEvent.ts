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

      // Stream via `.req()` rather than `.query()`: the app pool is built with
      // a 200ms `eoseTimeout`, which `query()` inherits — a fast general relay
      // EOSEing empty would abort the group before a slower git relay can
      // deliver the event. Streaming returns on the first match and gives
      // stragglers a real window after the first EOSE.
      const findEvent = async (
        relayUrls: string[],
        timeoutMs: number,
      ): Promise<NostrEvent | null> => {
        const reqSignal = AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]);
        try {
          for await (const msg of nostr.group(relayUrls).req(
            [{ ids: [id], limit: 1 }],
            { signal: reqSignal, eoseTimeout: 3000 },
          )) {
            if (msg[0] === 'EVENT') return msg[2];
            if (msg[0] === 'EOSE' || msg[0] === 'CLOSED') break;
          }
        } catch {
          // Aborted or relay error — treat as not found on this relay set.
        }
        return null;
      };

      const fromPool = await findEvent([...urls].slice(0, 12), 8000);
      if (fromPool) return fromPool;

      // Fall back to the search relays, since events discovered via NIP-50
      // may only live there.
      return findEvent(searchRelays, 5000);
    },
    enabled: Boolean(id),
    staleTime: 60 * 1000,
    retry: 1,
  });
}
