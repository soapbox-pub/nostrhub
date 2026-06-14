import { useNostr } from '@nostrify/react';
import { useQuery, useQueries } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { NostrFilter } from '@nostrify/nostrify';
import { DITTO_RELAY } from '@/lib/appRelays';
import { useAppContext } from '@/hooks/useAppContext';

const HOUR = 3600;
const DAY = 86400;
const MONTH = 30 * DAY;

/**
 * The Ditto relay supports `distinct:author` in the NIP-45 COUNT `search`
 * field, which counts unique authors rather than total events.
 */
const DISTINCT_AUTHOR = 'distinct:author';

/** A single point in the unique-users time series. */
export interface UniqueUsersPoint {
  /** Short axis label, e.g. "Jun 7". */
  label: string;
  /** Distinct authors active in this day's bucket. */
  count: number;
}

export interface ClientMetrics {
  /** Monthly Active Users — distinct authors in the last 30 days. */
  mau: number;
  /** Daily distinct-author counts over the last 30 days (oldest → newest). */
  uniqueUsersSeries: UniqueUsersPoint[];
}

/**
 * Snap a unix timestamp to the start of its UTC hour. Snapping keeps query
 * keys stable across re-renders so React Query doesn't refetch every render.
 */
function snapToHour(seconds: number): number {
  return Math.floor(seconds / HOUR) * HOUR;
}

/**
 * Generate daily time buckets for the past N days, snapped to hour boundaries
 * for stable query keys. Returned oldest → newest.
 */
function dailyBuckets(days: number): Array<{ since: number; until: number; label: string }> {
  const now = snapToHour(Math.floor(Date.now() / 1000));
  const buckets: Array<{ since: number; until: number; label: string }> = [];

  for (let i = days - 1; i >= 0; i--) {
    const until = now - i * DAY;
    const since = until - DAY;
    const label = new Date(until * 1000).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
    buckets.push({ since, until, label });
  }

  return buckets;
}

/**
 * Fetch usage metrics for a NIP-89 client via NIP-45 COUNT queries against the
 * Ditto relay. Exposes the two metrics surfaced on the app detail page:
 *
 * - **MAU** — distinct authors who published with this client in the last 30 days.
 * - **Unique Users (30d)** — a daily time series of distinct authors.
 *
 * Accepts one or more `#client` tag values, all OR'd together in the COUNT
 * filter, so a client with multiple tags is counted as a single client.
 *
 * Returns `undefined` data (and never throws to the UI) when the relay does not
 * support NIP-45 COUNT or the `distinct:author` search extension.
 */
export function useClientMetrics(clientTags: string[]) {
  const { nostr } = useNostr();
  const { config } = useAppContext();
  const statsRelay = config.statsRelay || DITTO_RELAY;

  return useQuery({
    queryKey: ['client-metrics', clientTags, statsRelay],
    queryFn: async (c): Promise<ClientMetrics> => {
      const relay = nostr.relay(statsRelay);
      if (!relay.count) {
        throw new Error('Relay does not support NIP-45 COUNT');
      }

      const clientFilter: Partial<NostrFilter> = { '#client': clientTags };
      const now = snapToHour(Math.floor(Date.now() / 1000));
      const buckets = dailyBuckets(30);

      const [mauResult, seriesResults] = await Promise.all([
        relay.count(
          [{ ...clientFilter, search: DISTINCT_AUTHOR, since: now - MONTH, until: now }],
          { signal: c.signal },
        ),
        Promise.all(
          buckets.map((bucket) =>
            relay.count!(
              [{
                ...clientFilter,
                search: DISTINCT_AUTHOR,
                since: bucket.since,
                until: bucket.until,
              }],
              { signal: c.signal },
            ).then((r) => ({ label: bucket.label, count: r.count })),
          ),
        ),
      ]);

      return {
        mau: mauResult.count,
        uniqueUsersSeries: seriesResults,
      };
    },
    enabled: clientTags.length > 0,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Lightweight variant of {@link useClientMetrics} that fetches *only* the
 * Monthly Active Users headline — a single NIP-45 COUNT query against the
 * Ditto relay, with no 30-day time series.
 *
 * Designed for the apps directory, where dozens of cards each show an
 * active-users count: firing one COUNT per card (instead of the 31 that the
 * full metrics hook issues) keeps the grid affordable. Returns `undefined`
 * (and never throws to the UI) when the relay can't provide the metric.
 */
export function useClientActiveUsers(clientTags: string[]) {
  const { nostr } = useNostr();
  const { config } = useAppContext();
  const statsRelay = config.statsRelay || DITTO_RELAY;

  return useQuery(activeUsersQueryOptions(nostr, statsRelay, clientTags));
}

/**
 * Build the shared React Query options for a single app's active-users COUNT.
 * Factored out so {@link useClientActiveUsers} (per-card) and
 * {@link useClientActiveUsersBatch} (page-level, for sorting) issue queries
 * with identical keys — the per-card hook then reads straight from cache
 * instead of re-counting.
 */
function activeUsersQueryOptions(
  nostr: ReturnType<typeof useNostr>['nostr'],
  statsRelay: string,
  clientTags: string[],
) {
  return {
    queryKey: ['client-active-users', clientTags, statsRelay] as const,
    queryFn: async ({ signal }: { signal: AbortSignal }): Promise<number> => {
      const relay = nostr.relay(statsRelay);
      if (!relay.count) {
        throw new Error('Relay does not support NIP-45 COUNT');
      }

      const now = snapToHour(Math.floor(Date.now() / 1000));
      const result = await relay.count(
        [{ '#client': clientTags, search: DISTINCT_AUTHOR, since: now - MONTH, until: now }],
        { signal },
      );

      return result.count;
    },
    enabled: clientTags.length > 0,
    staleTime: 5 * 60 * 1000,
  };
}

/**
 * Batched variant of {@link useClientActiveUsers} for ranking the apps
 * directory by popularity. Issues one COUNT query per app (each keyed
 * identically to the per-card query, so {@link AppCard}'s own hook reads from
 * cache rather than re-counting) and returns a map of app key → active-user
 * count plus an overall loading flag.
 *
 * @param apps  One entry per app: a stable `key` (the app address) and the
 *              app's `#client` tag values.
 */
export function useClientActiveUsersBatch(
  apps: Array<{ key: string; clientTags: string[] }>,
): { counts: Map<string, number>; isLoading: boolean } {
  const { nostr } = useNostr();
  const { config } = useAppContext();
  const statsRelay = config.statsRelay || DITTO_RELAY;

  const results = useQueries({
    queries: apps.map((app) => activeUsersQueryOptions(nostr, statsRelay, app.clientTags)),
  });

  return useMemo(() => {
    const counts = new Map<string, number>();
    let isLoading = false;
    results.forEach((result, i) => {
      if (typeof result.data === 'number') {
        counts.set(apps[i].key, result.data);
      }
      if (result.isLoading) isLoading = true;
    });
    return { counts, isLoading };
  }, [results, apps]);
}
