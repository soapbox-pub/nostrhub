import type { NostrEvent, NostrFilter, NostrRelayCLOSED, NostrRelayEOSE, NostrRelayEVENT } from '@nostrify/nostrify';

/** The part of a relay pool (`nostr.group(urls)`) this needs. */
interface Requester {
  req(
    filters: NostrFilter[],
    opts?: { signal?: AbortSignal; eoseTimeout?: number },
  ): AsyncIterable<NostrRelayEVENT | NostrRelayEOSE | NostrRelayCLOSED>;
}

/**
 * Query a relay group and wait for more than the fastest relay.
 *
 * The app's pool ends a query 200 ms after the first relay's EOSE, which is
 * right for the general relays it reads from and wrong for a group mixing
 * them with git relays: the general ones answer first, with little git
 * traffic, and the git relays get cut off. This waits `eoseTimeout` after the
 * first EOSE instead. Never rejects; returns what arrived.
 */
export async function queryRelays(
  group: Requester,
  filters: NostrFilter[],
  { signal, eoseTimeout = 3000 }: { signal?: AbortSignal; eoseTimeout?: number } = {},
): Promise<NostrEvent[]> {
  const events = new Map<string, NostrEvent>();
  try {
    for await (const msg of group.req(filters, { signal, eoseTimeout })) {
      if (msg[0] === 'EOSE' || msg[0] === 'CLOSED') break;
      if (msg[0] === 'EVENT') events.set(msg[2].id, msg[2]);
    }
  } catch {
    // Aborted or a relay error: what arrived is what there is.
  }
  return [...events.values()];
}
