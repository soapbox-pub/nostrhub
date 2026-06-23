import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { seedOptimisticRepo } from '@/hooks/useGitRepo';
import {
  GIT_REPO_KIND,
  GIT_STATE_KIND,
  graspCloneUrl,
  parseRepoAnnouncement,
  parseRepoState,
} from '@/lib/git';
import { buildRepoTags } from '@/hooks/usePublishRepo';
import { prepareNewRepo, stateTagsFromBranches, GRASP_PROVISION_DELAY_MS } from '@/lib/repoCreate';
import type { NostrEvent } from '@nostrify/nostrify';

/** Fields for creating a brand-new repository from scratch. */
export interface CreateRepoParams {
  identifier: string;
  name: string;
  description?: string;
  /** GRASP relay URLs (`wss://…`) to provision the repo on. */
  graspServers: string[];
  /** Topic hashtags (without the leading `#`). */
  hashtags: string[];
  /** Extra web/browse URLs. */
  webUrls?: string[];
}

export interface CreateRepoOutcome {
  announcement: NostrEvent;
  cloneUrls: string[];
  branch: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Create a fresh git repository entirely in the browser and put it on Nostr:
 *
 *  1. Stage an `git init` + seed commit in an in-memory FS.
 *  2. Publish the NIP-34 kind 30617 announcement so the GRASP server can
 *     provision the bare repo (this MUST precede the push).
 *  3. Wait briefly, then push the packfile to the GRASP server(s).
 *  4. Publish the kind 30618 state event (HEAD + initial branch ref).
 */
export function useCreateRepo(): UseMutationResult<CreateRepoOutcome, Error, CreateRepoParams> {
  const { user } = useCurrentUser();
  const { mutateAsync: publish } = useNostrPublish();
  const queryClient = useQueryClient();

  return useMutation<CreateRepoOutcome, Error, CreateRepoParams>({
    mutationFn: async (params) => {
      if (!user) throw new Error('You must be logged in to create a repository.');

      const relays = [...new Set(params.graspServers.map((r) => new URL(r).href))];
      // Clone URLs are deterministic from the GRASP host + npub + identifier.
      const expectedCloneUrls = params.graspServers.map((g) =>
        graspCloneUrl(g, user.pubkey, params.identifier),
      );

      // 1. Stage the repo locally.
      const prepared = await prepareNewRepo({
        name: params.name,
        description: params.description,
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

      // 3. Give the GRASP server a moment, then push the packfile.
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
