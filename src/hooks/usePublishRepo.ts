import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { seedOptimisticRepo } from '@/hooks/useGitRepo';
import { GIT_REPO_KIND, parseRepoAnnouncement } from '@/lib/git';
import type { NostrEvent } from '@nostrify/nostrify';

/** Fields for publishing a NIP-34 repository announcement (kind 30617). */
export interface PublishRepoParams {
  /** `d` tag — stable kebab-case repo id. Generated from the name if omitted. */
  identifier: string;
  name: string;
  description?: string;
  /** Git clone URLs (https or `nostr://`). */
  cloneUrls: string[];
  /** Human-facing browse URLs (https). */
  webUrls: string[];
  /** Relays that monitor this repo (ws/wss). */
  relays: string[];
  /** Topic hashtags (without the leading `#`). */
  hashtags: string[];
  /**
   * Earliest unique commit id (`["r", <id>, "euc"]`) — the cross-fork identity
   * of the project. Auto-detected from an in-browser clone when available.
   */
  earliestCommit?: string;
}

function trimList(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))];
}

/** Build the tag array for a kind 30617 repository announcement. */
export function buildRepoTags(params: PublishRepoParams): string[][] {
  const tags: string[][] = [['d', params.identifier]];

  if (params.name.trim()) tags.push(['name', params.name.trim()]);
  if (params.description?.trim()) tags.push(['description', params.description.trim()]);

  const clone = trimList(params.cloneUrls);
  if (clone.length) tags.push(['clone', ...clone]);

  const web = trimList(params.webUrls);
  if (web.length) tags.push(['web', ...web]);

  const relays = trimList(params.relays);
  if (relays.length) tags.push(['relays', ...relays]);

  for (const tag of trimList(params.hashtags.map((t) => t.replace(/^#/, '').toLowerCase()))) {
    tags.push(['t', tag]);
  }

  if (params.earliestCommit?.trim()) {
    tags.push(['r', params.earliestCommit.trim(), 'euc']);
  }

  // NIP-31 human-readable fallback.
  tags.push(['alt', `git repository: ${params.name.trim() || params.identifier}`]);

  return tags;
}

/**
 * Publish a NIP-34 repository announcement (kind 30617). This is how a repo —
 * including one mirrored from an external git URL — becomes discoverable on
 * NostrHub's `/repos` directory.
 */
export function usePublishRepo(): UseMutationResult<NostrEvent, Error, PublishRepoParams> {
  const { mutateAsync: publish } = useNostrPublish();
  const queryClient = useQueryClient();

  return useMutation<NostrEvent, Error, PublishRepoParams>({
    mutationFn: async (params) => {
      const event = await publish({ kind: GIT_REPO_KIND, content: '', tags: buildRepoTags(params) });
      // Seed the optimistic cache so the repo page renders before relays index it.
      seedOptimisticRepo(queryClient, { repo: parseRepoAnnouncement(event), state: null });
      return event;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['git-repos'] });
    },
  });
}
