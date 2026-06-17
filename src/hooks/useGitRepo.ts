import { useNostr } from '@nostrify/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAppContext } from '@/hooks/useAppContext';
import { getEffectiveRelays } from '@/lib/appRelays';
import {
  GIT_DISCOVERY_RELAYS,
  GIT_REPO_KIND,
  GIT_STATE_KIND,
  isValidRepoAnnouncement,
  parseRepoAnnouncement,
  parseRepoState,
  type GitRepoAnnouncement,
  type GitRepoState,
} from '@/lib/git';

export interface UseGitRepoOptions {
  /** Repository owner (hex pubkey). */
  pubkey: string;
  /** Repository `d` tag identifier. */
  identifier: string;
  /** Extra relay hints (e.g. from the naddr). */
  relays?: string[];
}

export interface GitRepoData {
  repo: GitRepoAnnouncement | null;
  state: GitRepoState | null;
}

/**
 * Relay-agnostic cache key for an optimistically-published repo. The main
 * `['git-repo', ...]` query key embeds relay hints (which vary by entry point),
 * so a just-published repo is stashed here and used as a fallback until relays
 * have it indexed.
 */
function optimisticKey(pubkey: string, identifier: string) {
  return ['git-repo-optimistic', pubkey, identifier] as const;
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
 * Fetch a NIP-34 repository announcement (kind 30617) and its state event
 * (kind 30618). Queries the user's read relays plus well-known GRASP relays
 * plus any relay hints, since git events rarely live on general-purpose relays.
 *
 * The filter is constrained to `authors: [pubkey]`, so spoofed announcements
 * from other pubkeys are excluded.
 */
export function useGitRepo({ pubkey, identifier, relays }: UseGitRepoOptions) {
  const { nostr } = useNostr();
  const { config } = useAppContext();
  const queryClient = useQueryClient();

  return useQuery<GitRepoData>({
    queryKey: ['git-repo', pubkey, identifier, [...(relays ?? [])].sort().join(',')],
    queryFn: async ({ signal }) => {
      const readRelays = getEffectiveRelays(
        config.relayMetadata,
        config.useAppRelays,
        config.useUserRelays,
      ).relays
        .filter((r) => r.read)
        .map((r) => r.url);

      const urls = new Set<string>();
      for (const url of [...(relays ?? []), ...GIT_DISCOVERY_RELAYS, ...readRelays]) {
        const normalized = normalizeRelayUrl(url);
        if (normalized) urls.add(normalized);
      }

      const events = await nostr.group([...urls].slice(0, 10)).query(
        [{ kinds: [GIT_REPO_KIND, GIT_STATE_KIND], authors: [pubkey], '#d': [identifier] }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) },
      );

      // Addressable events: keep only the newest per kind.
      let repoEvent: (typeof events)[number] | undefined;
      let stateEvent: (typeof events)[number] | undefined;
      for (const ev of events) {
        if (ev.kind === GIT_REPO_KIND && isValidRepoAnnouncement(ev)) {
          if (!repoEvent || ev.created_at > repoEvent.created_at) repoEvent = ev;
        } else if (ev.kind === GIT_STATE_KIND) {
          if (!stateEvent || ev.created_at > stateEvent.created_at) stateEvent = ev;
        }
      }

      const result: GitRepoData = {
        repo: repoEvent ? parseRepoAnnouncement(repoEvent) : null,
        state: stateEvent ? parseRepoState(stateEvent) : null,
      };

      // Until relays have indexed a freshly-published repo, fall back to the
      // optimistic copy seeded at publish time so the page renders immediately.
      if (!result.repo) {
        const seeded = queryClient.getQueryData<GitRepoData>(optimisticKey(pubkey, identifier));
        if (seeded?.repo) return seeded;
      }

      return result;
    },
    enabled: Boolean(pubkey && identifier),
    staleTime: 60 * 1000,
    retry: 1,
  });
}

/**
 * Seed the optimistic repo cache so a just-published repo renders before relays
 * have it. Returns the parsed data that was stored.
 */
export function seedOptimisticRepo(
  queryClient: ReturnType<typeof useQueryClient>,
  data: GitRepoData,
): void {
  if (!data.repo) return;
  queryClient.setQueryData(optimisticKey(data.repo.pubkey, data.repo.identifier), data);
}
