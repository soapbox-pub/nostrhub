import { useQuery } from '@tanstack/react-query';

/**
 * A relay's NIP-11 information document.
 * @see https://github.com/nostr-protocol/nips/blob/master/11.md
 */
export interface RelayInfoDocument {
  name?: string;
  description?: string;
  icon?: string;
  banner?: string;
  pubkey?: string;
  contact?: string;
  software?: string;
  version?: string;
  supported_nips?: number[];
  limitation?: {
    auth_required?: boolean;
    payment_required?: boolean;
    restricted_writes?: boolean;
  };
  fees?: {
    admission?: { amount: number; unit: string }[];
    subscription?: { amount: number; unit: string; period?: number }[];
  };
}

/** Convert a relay websocket URL to its HTTP(S) form for NIP-11 requests. */
export function relayToHttpUrl(relayUrl: string): string | null {
  try {
    const parsed = new URL(relayUrl);
    if (parsed.protocol === 'wss:') parsed.protocol = 'https:';
    if (parsed.protocol === 'ws:') parsed.protocol = 'http:';
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

/**
 * Fetch a relay's NIP-11 information document (`application/nostr+json`).
 *
 * Ported from Ditto. Cached aggressively (12h stale) since relay metadata
 * rarely changes.
 */
export function useRelayInfo(relayUrl: string | undefined) {
  const httpUrl = relayUrl ? relayToHttpUrl(relayUrl) : null;

  return useQuery<RelayInfoDocument>({
    queryKey: ['relay-info', relayUrl],
    queryFn: async ({ signal }) => {
      if (!httpUrl) throw new Error('Invalid relay URL');

      const response = await fetch(httpUrl, {
        headers: { Accept: 'application/nostr+json' },
        signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const payload: unknown = await response.json();
      if (!payload || typeof payload !== 'object') {
        throw new Error('Invalid NIP-11 response');
      }

      return payload as RelayInfoDocument;
    },
    enabled: !!httpUrl,
    staleTime: 12 * 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    retry: 1,
  });
}
