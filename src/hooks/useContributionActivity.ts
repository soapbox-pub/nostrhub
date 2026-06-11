import { useNostr } from '@nostrify/react';
import { useQueries } from '@tanstack/react-query';
import { format } from 'date-fns';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';
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
/** Hard ceiling on pagination round-trips per segment. */
const MAX_PAGES = 10;

/**
 * Backfill segment boundaries, in days ago. The trailing window is fetched as
 * contiguous segments (0-7, 7-30, 30-90, 90-365) so widening the window only
 * fetches the older slice — already-cached segments are reused as-is.
 */
const SEGMENT_BOUNDS = [0, 7, 30, 90, 365];

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
 * Fetch and bucket one segment of the window. Pages backwards through relay
 * results with `until`, since relays cap result counts silently.
 */
async function fetchSegment(
  query: (filters: NostrFilter[], opts: { signal: AbortSignal }) => Promise<NostrEvent[]>,
  pubkey: string,
  since: number,
  segmentUntil: number | undefined,
  signal: AbortSignal,
): Promise<ContributionActivity> {
  const days: Record<string, DayActivity> = {};
  const seen = new Set<string>();
  let total = 0;
  let until = segmentUntil;

  for (let page = 0; page < MAX_PAGES; page++) {
    const events = await query(
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

    // Segment exhausted: empty page, page reached past the segment start,
    // or nothing new (relay ignored `until` / returned duplicates).
    if (events.length === 0 || oldest <= since || added === 0) break;
    until = oldest - 1;
  }

  return { days, total };
}

/**
 * Count a user's contributions per day over the trailing `windowDays`,
 * fetched as independently-cached backfill segments and merged.
 */
export function useContributionActivity(pubkey: string, windowDays: number) {
  const { nostr } = useNostr();

  // Segments (in days ago) needed to cover the requested window.
  const segments: { newer: number; older: number }[] = [];
  for (let i = 0; i < SEGMENT_BOUNDS.length - 1; i++) {
    if (SEGMENT_BOUNDS[i] >= windowDays) break;
    segments.push({
      newer: SEGMENT_BOUNDS[i],
      older: Math.min(SEGMENT_BOUNDS[i + 1], windowDays),
    });
  }

  return useQueries({
    queries: segments.map(({ newer, older }) => ({
      // Keyed by day offsets (not timestamps) so cache entries survive
      // re-renders and hour ticks.
      queryKey: ['contribution-activity', pubkey, newer, older],
      queryFn: ({ signal }: { signal: AbortSignal }) => {
        // `ago` snaps to the hour; adjacent segments share the boundary
        // expression, making them contiguous and non-overlapping.
        const since = ago(older * DAY);
        const until = newer === 0 ? undefined : ago(newer * DAY) - 1;
        return fetchSegment(nostr.query.bind(nostr), pubkey, since, until, signal);
      },
      staleTime: 5 * 60 * 1000,
    })),
    combine: (results) => {
      const isLoading = results.some((r) => r.isLoading);
      if (isLoading || results.some((r) => !r.data)) {
        return { data: undefined, isLoading };
      }

      const days: Record<string, DayActivity> = {};
      let total = 0;
      for (const r of results) {
        total += r.data!.total;
        for (const [key, activity] of Object.entries(r.data!.days)) {
          const day = (days[key] ??= { total: 0, categories: {} });
          day.total += activity.total;
          for (const [category, count] of Object.entries(activity.categories)) {
            const c = category as ContributionCategory;
            day.categories[c] = (day.categories[c] ?? 0) + count;
          }
        }
      }

      return { data: { days, total } satisfies ContributionActivity, isLoading };
    },
  });
}
