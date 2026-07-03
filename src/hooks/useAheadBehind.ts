import { useQuery } from '@tanstack/react-query';
import { computeAheadBehind, type AheadBehind } from '@/lib/aheadBehind';
import { GIT_PR_KIND, type GitRepoAnnouncement } from '@/lib/git';
import type { SingleGitTicket } from '@/hooks/useGitTicket';

/**
 * Compute ahead/behind counts for a merge request against its repository's
 * default branch, by shallow-fetching both heads from the repo's GRASP
 * mirrors in the browser. Resolves to `null` counts when the tip can't be
 * fetched or the histories don't meet within the depth cap.
 */
export function useAheadBehind({
  repo,
  headBranch,
  ticket,
}: {
  repo: GitRepoAnnouncement | null | undefined;
  /** Default branch from the repo state (30618 HEAD), if known. */
  headBranch?: string;
  ticket: SingleGitTicket | null | undefined;
}) {
  const enabled = Boolean(
    ticket &&
      ticket.kind === GIT_PR_KIND &&
      ticket.tipCommit &&
      repo &&
      repo.cloneUrls.length > 0,
  );

  return useQuery<AheadBehind>({
    queryKey: [
      'ahead-behind',
      ticket?.tipEventId ?? '',
      ticket?.tipCommit ?? '',
      repo?.pubkey ?? '',
      repo?.identifier ?? '',
      headBranch ?? '',
    ],
    queryFn: async ({ signal }) => {
      if (!ticket?.tipCommit || !repo) throw new Error('Not ready');

      // GRASP mirrors first: they serve CORS-enabled smart-HTTP.
      const cloneUrls = [...repo.cloneUrls].sort((a, b) => {
        const aGrasp = repo.graspServers.includes(new URL(a).hostname) ? 0 : 1;
        const bGrasp = repo.graspServers.includes(new URL(b).hostname) ? 0 : 1;
        return aGrasp - bGrasp;
      });

      return computeAheadBehind({
        cloneUrls,
        extraCloneUrls: ticket.prCloneUrls,
        tipRef: `refs/nostr/${ticket.tipEventId}`,
        tipCommit: ticket.tipCommit,
        targetRef: headBranch,
        signal,
      });
    },
    enabled,
    staleTime: Infinity,
    gcTime: 10 * 60 * 1000,
    retry: false,
  });
}
