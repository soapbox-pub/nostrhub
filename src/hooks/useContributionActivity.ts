import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ago, DAY } from '@/lib/timeRanges';
import { CUSTOM_NIP_KIND } from '@/lib/nips';
import { GIT_REPO_KIND, GIT_STATE_KIND } from '@/lib/git';

/** NIP-34 code-contribution kinds (regular events, stored permanently). */
const GIT_PATCH_KIND = 1617;
const GIT_PR_KIND = 1618;
const GIT_PR_UPDATE_KIND = 1619;
const GIT_ISSUE_KIND = 1621;

export type ContributionCategory = 'code' | 'issue' | 'nip' | 'repo';

/**
 * What counts as a "contribution": durable artifacts of protocol/code work.
 *
 * - `code` — patches (1617), pull requests (1618), PR updates (1619)
 * - `issue` — issues opened (1621)
 * - `nip` — community NIPs published or revised (30817)
 * - `repo` — repository announcements and state updates / pushes (30617, 30618)
 *
 * Deliberately excluded: comments (1111), chat (9), and labels (1985) —
 * discussion is not a code contribution.
 *
 * Caveat: 30817/30617/30618 are addressable, so relays keep only the latest
 * revision per address — their history collapses onto the last-update day.
 * Deep history comes from the regular kinds (1617/1618/1619/1621).
 */
const KIND_CATEGORIES: Record<number, ContributionCategory> = {
  [GIT_PATCH_KIND]: 'code',
  [GIT_PR_KIND]: 'code',
  [GIT_PR_UPDATE_KIND]: 'code',
  [GIT_ISSUE_KIND]: 'issue',
  [CUSTOM_NIP_KIND]: 'nip',
  [GIT_REPO_KIND]: 'repo',
  [GIT_STATE_KIND]: 'repo',
};

const CONTRIBUTION_KINDS = Object.keys(KIND_CATEGORIES).map(Number);

/** Relay page size; most public relays silently cap results around 500. */
const PAGE_SIZE = 500;
/** Hard ceiling on pagination round-trips. */
const MAX_PAGES = 10;

export interface DayActivity {
  total: number;
  categories: Partial<Record<ContributionCategory, number>>;
}

export interface ContributionActivity {
  /** Activity per local calendar day, keyed `yyyy-MM-dd`. */
  days: Record<string, DayActivity>;
  /** Total contributions in the window. */
  total: number;
}

/**
 * Count a user's contributions per day over the trailing `windowDays`. Pages
 * backwards through relay results with `until` until the window is exhausted,
 * since relays cap result counts silently.
 */
export function useContributionActivity(pubkey: string, windowDays: number) {
  const { nostr } = useNostr();

  // `ago` snaps to the hour, keeping the query key stable across renders.
  const since = ago(windowDays * DAY);

  return useQuery<ContributionActivity>({
    queryKey: ['contribution-activity', pubkey, since],
    queryFn: async ({ signal }) => {
      const days: Record<string, DayActivity> = {};
      const seen = new Set<string>();
      let total = 0;
      let until: number | undefined;

      for (let page = 0; page < MAX_PAGES; page++) {
        const events = await nostr.query(
          [{ authors: [pubkey], kinds: CONTRIBUTION_KINDS, since, until, limit: PAGE_SIZE }],
          { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) },
        );

        let oldest = Infinity;
        let added = 0;

        for (const ev of events) {
          oldest = Math.min(oldest, ev.created_at);
          if (seen.has(ev.id) || ev.created_at < since) continue;
          seen.add(ev.id);
          added++;
          total++;

          const category = KIND_CATEGORIES[ev.kind];
          if (!category) continue;
          const key = format(new Date(ev.created_at * 1000), 'yyyy-MM-dd');
          const day = (days[key] ??= { total: 0, categories: {} });
          day.total++;
          day.categories[category] = (day.categories[category] ?? 0) + 1;
        }

        // Window exhausted: empty page, page reached past the window start,
        // or nothing new (relay ignored `until` / returned duplicates).
        if (events.length === 0 || oldest <= since || added === 0) break;
        until = oldest - 1;
      }

      return { days, total };
    },
    staleTime: 5 * 60 * 1000,
  });
}
