import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';
import {
  APP_REVIEW_KIND,
  REVIEW_LABEL,
  parseReviewEvent,
  type ReviewReport,
} from '@/lib/appReviews';

/**
 * Reduce review events to the latest revision per (author, d-tag) — kind 31986
 * is addressable, so a user re-rating the same app+NIP replaces their previous
 * report — then parse and sort newest first.
 */
function toReviews(events: NostrEvent[]): ReviewReport[] {
  const latest = new Map<string, NostrEvent>();
  for (const event of events) {
    const d = event.tags.find(([name]) => name === 'd')?.[1] ?? '';
    const key = `${event.pubkey}:${d}`;
    const prev = latest.get(key);
    if (!prev || event.created_at > prev.created_at) latest.set(key, event);
  }

  return Array.from(latest.values())
    .map(parseReviewEvent)
    .filter((review): review is ReviewReport => review !== null)
    .sort((a, b) => b.createdAt - a.createdAt);
}

/** NIP compatibility reports for a specific app (by its 31990 address). */
export function useAppReviews(appAddress: string | undefined) {
  const { nostr } = useNostr();

  return useQuery<ReviewReport[]>({
    queryKey: ['app-reviews', appAddress ?? ''],
    queryFn: async ({ signal }) => {
      const events = await nostr.query(
        [
          {
            kinds: [APP_REVIEW_KIND],
            '#l': [REVIEW_LABEL],
            '#a': [appAddress!],
            limit: 500,
          },
        ],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) },
      );

      return toReviews(events);
    },
    enabled: !!appAddress,
    staleTime: 2 * 60 * 1000,
  });
}

/** All NIP compatibility reports across all apps, for directory aggregation. */
export function useAllAppReviews() {
  const { nostr } = useNostr();

  return useQuery<ReviewReport[]>({
    queryKey: ['app-reviews', 'all'],
    queryFn: async ({ signal }) => {
      const events = await nostr.query(
        [
          {
            kinds: [APP_REVIEW_KIND],
            '#l': [REVIEW_LABEL],
            limit: 1000,
          },
        ],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]) },
      );

      return toReviews(events);
    },
    staleTime: 2 * 60 * 1000,
  });
}
