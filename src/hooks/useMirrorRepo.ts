import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAppContext } from '@/hooks/useAppContext';
import { seedOptimisticRepo } from '@/hooks/useGitRepo';
import {
  GIT_REPO_KIND,
  GIT_STATE_KIND,
  graspCloneUrl,
  parseRepoAnnouncement,
  parseRepoState,
} from '@/lib/git';
import { buildRepoTags } from '@/hooks/usePublishRepo';
import { prepareMirror, stateTagsFromBranches, GRASP_PROVISION_DELAY_MS } from '@/lib/repoCreate';
import type { NostrEvent } from '@nostrify/nostrify';

/** Fields for mirroring an existing repository onto Nostr (ngit/GRASP). */
export interface MirrorRepoParams {
  identifier: string;
  name: string;
  description?: string;
  /** The source git URL to clone the objects from (https smart-HTTP). */
  sourceUrl: string;
  /** GRASP relay URLs (`wss://…`) to mirror onto. */
  graspServers: string[];
  hashtags: string[];
  webUrls?: string[];
}

export interface MirrorRepoOutcome {
  announcement: NostrEvent;
  cloneUrls: string[];
  branch: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Mirror an existing repository onto Nostr: clone its objects in the browser,
 * publish the NIP-34 kind 30617 announcement (so the GRASP server provisions
 * the bare repo), then push the objects and publish the kind 30618 state. This
 * produces a genuine Nostr-hosted copy, not an announcement that merely links
 * back to the original host.
 */
export function useMirrorRepo(): UseMutationResult<MirrorRepoOutcome, Error, MirrorRepoParams> {
  const { user } = useCurrentUser();
  const { config } = useAppContext();
  const { mutateAsync: publish } = useNostrPublish();
  const queryClient = useQueryClient();

  return useMutation<MirrorRepoOutcome, Error, MirrorRepoParams>({
    mutationFn: async (params) => {
      if (!user) throw new Error('You must be logged in to add a repository.');

      const relays = [...new Set(params.graspServers.map((r) => new URL(r).href))];
      const expectedCloneUrls = params.graspServers.map((g) =>
        graspCloneUrl(g, user.pubkey, params.identifier),
      );

      // 1. Clone the source's objects into memory (no push yet).
      const prepared = await prepareMirror({
        sourceUrl: params.sourceUrl,
        corsProxy: config.gitCorsProxy,
      });

      const tags = buildRepoTags({
        identifier: params.identifier,
        name: params.name,
        description: params.description,
        cloneUrls: expectedCloneUrls,
        webUrls: params.webUrls ?? [],
        relays,
        hashtags: params.hashtags,
        earliestCommit: prepared.earliestCommit,
      });

      // 2. Announce (30617) + state (30618) first, so the GRASP server
      //    provisions the bare repo and knows the expected refs before we push.
      const announcement = await publish({ kind: GIT_REPO_KIND, content: '', tags });
      const stateEvent = await publish({
        kind: GIT_STATE_KIND,
        content: '',
        tags: stateTagsFromBranches(params.identifier, prepared.branch, prepared.branches),
      });

      // 3. Give the GRASP server a moment, then push the mirrored objects.
      await sleep(GRASP_PROVISION_DELAY_MS);
      const { cloneUrls } = await prepared.push(params.graspServers, user.pubkey, params.identifier);

      seedOptimisticRepo(queryClient, {
        repo: parseRepoAnnouncement(announcement),
        state: parseRepoState(stateEvent),
      });

      return { announcement, cloneUrls, branch: prepared.branch };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['git-repos'] });
      queryClient.invalidateQueries({ queryKey: ['git-repo'] });
    },
  });
}
