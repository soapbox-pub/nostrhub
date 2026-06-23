import { useNostr } from '@nostrify/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';
import { useAppContext } from '@/hooks/useAppContext';
import { useNostrPublish } from '@/hooks/useNostrPublish';
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

      const dedupe = (input: string[]): string[] => {
        const out = new Set<string>();
        for (const url of input) {
          const normalized = normalizeRelayUrl(url);
          if (normalized) out.add(normalized);
        }
        return [...out];
      };

      // Phase 1: the app/user read relays (plus any naddr relay hints). These
      // are fast and carry most traffic. Phase 2 (GRASP discovery relays) is a
      // fallback only used when the announcement isn't found on the app relays,
      // since GRASP servers are slower and would otherwise be cut off by the
      // pool's short post-EOSE window.
      const primaryRelays = dedupe([...(relays ?? []), ...readRelays]);
      const fallbackRelays = dedupe(GIT_DISCOVERY_RELAYS).filter(
        (url) => !primaryRelays.includes(url),
      );

      let repoEvent: NostrEvent | undefined;
      let stateEvent: NostrEvent | undefined;

      const collect = async (urls: string[]) => {
        if (urls.length === 0) return;
        // Collect with a generous EOSE window so slow GRASP relays that hold
        // the only copy of the announcement aren't cut off prematurely.
        const reqSignal = AbortSignal.any([signal, AbortSignal.timeout(8000)]);
        try {
          for await (const msg of nostr.group(urls.slice(0, 10)).req(
            [{ kinds: [GIT_REPO_KIND, GIT_STATE_KIND], authors: [pubkey], '#d': [identifier] }],
            { signal: reqSignal, eoseTimeout: 4000 },
          )) {
            if (msg[0] === 'EOSE' || msg[0] === 'CLOSED') break;
            if (msg[0] !== 'EVENT') continue;
            const ev = msg[2];
            // Addressable events: keep only the newest per kind.
            if (ev.kind === GIT_REPO_KIND && isValidRepoAnnouncement(ev)) {
              if (!repoEvent || ev.created_at > repoEvent.created_at) repoEvent = ev;
            } else if (ev.kind === GIT_STATE_KIND) {
              if (!stateEvent || ev.created_at > stateEvent.created_at) stateEvent = ev;
            }
          }
        } catch {
          // Aborted or relay error — keep whatever was collected so far.
        }
      };

      await collect(primaryRelays);

      // Fall through to GRASP discovery relays only if the announcement (the
      // event that actually renders the page) wasn't found on the app relays.
      if (!repoEvent) {
        await collect(fallbackRelays);
      }

      const result: GitRepoData = {
        repo: repoEvent ? parseRepoAnnouncement(repoEvent) : null,
        state: stateEvent ? parseRepoState(stateEvent) : null,
      };

      // Prefer a freshly-published copy until relays have indexed it. This
      // covers two cases: a brand-new repo relays don't have yet, and an edit
      // where relays still serve the previous (stale) announcement. We trust
      // the optimistic copy only when it's newer than what relays returned.
      const seeded = queryClient.getQueryData<GitRepoData>(optimisticKey(pubkey, identifier));
      if (seeded?.repo && seeded.repo.createdAt >= (result.repo?.createdAt ?? 0)) {
        return {
          repo: seeded.repo,
          // Keep any fresher state from relays; otherwise reuse the seeded one.
          state:
            result.state && result.state.createdAt > (seeded.state?.createdAt ?? 0)
              ? result.state
              : seeded.state ?? result.state,
        };
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

export interface DeleteRepoParams {
  /** The repository announcement (kind 30617) to delete. */
  repo: GitRepoAnnouncement;
  /** The repository state event (kind 30618), if one exists. */
  state?: GitRepoState | null;
}

/**
 * Request deletion of a NIP-34 repository via a NIP-09 kind-5 event.
 *
 * A repo is up to two addressable events — the announcement (30617) and its
 * state (30618) — so the deletion request references both `a` coordinates
 * (plus the underlying `e` ids) so honoring relays drop both. Only the repo
 * owner can produce a valid deletion, since the kind-5 event must be signed by
 * the same pubkey that authored the targeted events.
 *
 * Note: this only requests relays to drop the Nostr events. It cannot
 * un-provision a bare repo already pushed to a GRASP server.
 */
export function useDeleteRepo() {
  const { mutateAsync: publish } = useNostrPublish();
  const queryClient = useQueryClient();

  return useMutation<NostrEvent, Error, DeleteRepoParams>({
    mutationFn: async ({ repo, state }) => {
      const { pubkey, identifier, event } = repo;
      const tags: string[][] = [
        ['a', `${GIT_REPO_KIND}:${pubkey}:${identifier}`],
        ['e', event.id],
        ['k', GIT_REPO_KIND.toString()],
      ];
      if (state) {
        tags.push(['a', `${GIT_STATE_KIND}:${pubkey}:${identifier}`]);
        tags.push(['e', state.event.id]);
        tags.push(['k', GIT_STATE_KIND.toString()]);
      }
      return publish({ kind: 5, content: '', tags });
    },
    onSuccess: (_event, { repo }) => {
      // Drop the optimistic copy so the deleted repo can't resurface from cache.
      queryClient.removeQueries({ queryKey: optimisticKey(repo.pubkey, repo.identifier) });
      queryClient.invalidateQueries({ queryKey: ['git-repos'] });
      queryClient.invalidateQueries({ queryKey: ['git-repo'] });
    },
  });
}
