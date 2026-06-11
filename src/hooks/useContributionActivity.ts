import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { format, startOfWeek, subDays } from 'date-fns';
import { CUSTOM_NIP_KIND } from '@/lib/nips';
import { GIT_REPO_KIND, GIT_STATE_KIND } from '@/lib/git';

/**
 * Event kinds that count as "contributions" on a profile heatmap:
 * NIPs (30817), repo announcements (30617), repo state updates / pushes
 * (30618), comments (1111), chat messages (9), and NIP-32 approvals (1985).
 */
const CONTRIBUTION_KINDS = [CUSTOM_NIP_KIND, GIT_REPO_KIND, GIT_STATE_KIND, 1111, 9, 1985];

export interface ContributionActivity {
  /** Events per local calendar day, keyed `yyyy-MM-dd`. */
  days: Record<string, number>;
  /** Total events in the window. */
  total: number;
}

/** Unix timestamp for the start of the heatmap window (53 aligned weeks). */
export function activityWindowStart(now = new Date()): Date {
  return startOfWeek(subDays(now, 364));
}

/**
 * Count a user's contribution events per day over the last year, for the
 * GitHub-style profile heatmap.
 */
export function useContributionActivity(pubkey: string) {
  const { nostr } = useNostr();

  return useQuery<ContributionActivity>({
    queryKey: ['contribution-activity', pubkey],
    queryFn: async ({ signal }) => {
      const since = Math.floor(activityWindowStart().getTime() / 1000);

      const events = await nostr.query(
        [{ authors: [pubkey], kinds: CONTRIBUTION_KINDS, since, limit: 2000 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]) },
      );

      const days: Record<string, number> = {};
      const seen = new Set<string>();
      for (const ev of events) {
        if (seen.has(ev.id)) continue;
        seen.add(ev.id);
        const key = format(new Date(ev.created_at * 1000), 'yyyy-MM-dd');
        days[key] = (days[key] ?? 0) + 1;
      }

      return { days, total: seen.size };
    },
    staleTime: 5 * 60 * 1000,
  });
}
