import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrFilter } from '@nostrify/nostrify';
import { useAppContext } from '@/hooks/useAppContext';
import { getEffectiveRelays } from '@/lib/appRelays';
import { GIT_DISCOVERY_RELAYS, GIT_ISSUE_KIND, GIT_PR_KIND, GIT_REPO_KIND } from '@/lib/git';

export interface GitTicketCounts {
  issues: number;
  pullRequests: number;
}

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
 * Total issue / merge-request counts for a repository via NIP-45 `COUNT`.
 *
 * `COUNT` is only defined on individual relays (not the pool), and many relays
 * don't implement it, so each candidate relay is asked directly and the first
 * successful response per filter wins (counts aren't summed — relays largely
 * mirror the same git events, so summing would over-count). Relays that reject
 * `COUNT` with a `CLOSED` simply throw and are skipped.
 */
export function useGitTicketCounts({
  pubkey,
  identifier,
  relays = [],
}: {
  pubkey: string;
  identifier: string;
  relays?: string[];
}) {
  const { nostr } = useNostr();
  const { config } = useAppContext();

  return useQuery<GitTicketCounts>({
    queryKey: ['git-ticket-counts', pubkey, identifier, [...relays].sort().join(',')],
    queryFn: async ({ signal }) => {
      const readRelays = getEffectiveRelays(
        config.relayMetadata,
        config.useAppRelays,
        config.useUserRelays,
      ).relays
        .filter((r) => r.read)
        .map((r) => r.url);

      const candidates = new Set<string>();
      for (const url of [...GIT_DISCOVERY_RELAYS, ...relays, ...readRelays]) {
        const normalized = normalizeRelayUrl(url);
        if (normalized) candidates.add(normalized);
      }

      const address = `${GIT_REPO_KIND}:${pubkey}:${identifier}`;

      /** Ask each relay for a COUNT of `filter`; return the first that answers. */
      const countOne = async (filter: NostrFilter): Promise<number> => {
        for (const url of candidates) {
          try {
            const relay = nostr.relay(url);
            // COUNT is optional in the NRelay interface; skip relays without it.
            if (typeof relay.count !== 'function') continue;
            const result = await relay.count([filter], {
              signal: AbortSignal.any([signal, AbortSignal.timeout(4000)]),
            });
            if (typeof result?.count === 'number') return result.count;
          } catch {
            // Relay doesn't support COUNT, refused, or timed out — try the next.
          }
        }
        return 0;
      };

      const [issues, pullRequests] = await Promise.all([
        countOne({ kinds: [GIT_ISSUE_KIND], '#a': [address] }),
        countOne({ kinds: [GIT_PR_KIND], '#a': [address] }),
      ]);

      return { issues, pullRequests };
    },
    enabled: Boolean(pubkey && identifier),
    staleTime: 60 * 1000,
    retry: false,
  });
}
