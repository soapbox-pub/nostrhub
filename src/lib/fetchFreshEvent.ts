import type { NostrFilter, NostrEvent } from '@nostrify/nostrify';

/** Minimal shape of the Nostrify pool we depend on. */
interface Queryable {
  query(filters: NostrFilter[], opts?: { signal?: AbortSignal }): Promise<NostrEvent[]>;
}

/**
 * Fetch the freshest event matching a filter directly from relays, bypassing
 * any TanStack Query cache. Used before writing a replaceable/addressable event
 * so a write on one device doesn't clobber a newer write from another device.
 *
 * Returns the event with the greatest `created_at`, or `null` if none.
 */
export async function fetchFreshEvent(
  nostr: Queryable,
  filter: NostrFilter,
  timeoutMs = 4000,
): Promise<NostrEvent | null> {
  try {
    const events = await nostr.query([{ ...filter, limit: 1 }], {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (events.length === 0) return null;
    return events.reduce((newest, e) => (e.created_at > newest.created_at ? e : newest));
  } catch {
    return null;
  }
}
