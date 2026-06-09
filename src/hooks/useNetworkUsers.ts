import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { DITTO_RELAY } from '@/lib/appRelays';
import { DAY, HOUR, MONTH } from '@/lib/timeRanges';

/**
 * The Ditto relay supports `distinct:author` in the NIP-45 COUNT `search`
 * field, which counts unique authors rather than total events.
 */
const DISTINCT_AUTHOR = 'distinct:author';

/** A single point in the unique-users time series. */
export interface NetworkUsersPoint {
  /** Short axis label, e.g. "Jun 7". */
  label: string;
  /** Distinct authors active in this day's bucket. */
  count: number;
}

export interface NetworkUsers {
  /** Monthly Active Users — distinct authors network-wide in the last 30 days. */
  mau: number;
  /** Daily distinct-author counts over the requested window (oldest → newest). */
  series: NetworkUsersPoint[];
}

/** Snap a unix timestamp to the start of its hour for stable query keys. */
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
 * Daily time series of distinct users active across the whole Nostr network
 * over the past `days`, plus the Monthly Active Users (MAU) headline, via
 * NIP-45 COUNT queries against the Ditto relay.
 *
 * Each day's bucket counts the distinct authors who published a kind-1 note in
 * that 24h window; MAU counts distinct authors over the whole 30-day window.
 * Throws (surfaced as `isError`) when the relay does not support NIP-45 COUNT
 * or the `distinct:author` search extension.
 */
export function useNetworkUsers(days = 30) {
  const { nostr } = useNostr();

  return useQuery({
    queryKey: ['network-users', days],
    queryFn: async (c): Promise<NetworkUsers> => {
      const relay = nostr.relay(DITTO_RELAY);
      if (!relay.count) {
        throw new Error('Relay does not support NIP-45 COUNT');
      }

      const now = snapToHour(Math.floor(Date.now() / 1000));
      const buckets = dailyBuckets(days);

      const [mauResult, series] = await Promise.all([
        relay.count(
          [{ kinds: [1], search: DISTINCT_AUTHOR, since: now - MONTH, until: now }],
          { signal: c.signal },
        ),
        Promise.all(
          buckets.map((bucket) =>
            relay.count!(
              [{
                kinds: [1],
                search: DISTINCT_AUTHOR,
                since: bucket.since,
                until: bucket.until,
              }],
              { signal: c.signal },
            ).then((r) => ({ label: bucket.label, count: r.count })),
          ),
        ),
      ]);

      return { mau: mauResult.count, series };
    },
    staleTime: 5 * 60 * 1000,
  });
}
