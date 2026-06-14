import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';
import { DITTO_RELAY } from '@/lib/appRelays';
import { useAppContext } from '@/hooks/useAppContext';

export interface NipRevisionsArgs {
  kind: number;
  pubkey: string;
  identifier: string;
}

interface ReqCapable {
  req(
    filters: NostrFilter[],
    opts?: { signal?: AbortSignal },
  ): AsyncIterable<
    ['EVENT', string, NostrEvent] | ['EOSE', string] | ['CLOSED', string, string]
  >;
}

/**
 * Stream all events matching a filter via `req()` instead of `query()`.
 *
 * `query()` collects results into an `NSet`, which deduplicates replaceable and
 * addressable events down to the single latest version per address — so even
 * when the relay sends every historical version over the wire, `query()`
 * collapses them to one. `req()` hands us the raw stream, so we keep every
 * version and dedupe only by event id. (Pattern borrowed from Ditto's
 * EventRecoveryDialog.)
 */
async function reqAllVersions(
  nostr: ReqCapable,
  filters: NostrFilter[],
  signal: AbortSignal,
): Promise<NostrEvent[]> {
  const events: NostrEvent[] = [];
  const seen = new Set<string>();

  for await (const msg of nostr.req(filters, { signal })) {
    if (msg[0] === 'EOSE' || msg[0] === 'CLOSED') break;
    if (msg[0] === 'EVENT') {
      const event = msg[2];
      if (!seen.has(event.id)) {
        seen.add(event.id);
        events.push(event);
      }
    }
  }

  return events;
}

/**
 * Fetch every stored version of a replaceable/addressable event from the Ditto
 * relay, newest first.
 *
 * Ditto relays are special: when a filter matches the shape of a single Nostr
 * address (`kinds`/`authors`/`#d`), they return *past* versions of replaceable
 * and addressable events rather than collapsing to the latest. We query the
 * relay directly (not the default pool) and stream with `req()` to avoid NSet
 * deduplication discarding the older versions.
 */
export function useNipRevisions(args: NipRevisionsArgs | null, enabled = true) {
  const { nostr } = useNostr();
  const { config } = useAppContext();
  const revisionsRelay = config.statsRelay || DITTO_RELAY;

  return useQuery<NostrEvent[]>({
    queryKey: ['nip-revisions', revisionsRelay, args?.kind, args?.pubkey, args?.identifier],
    queryFn: async (c) => {
      if (!args) return [];
      const { kind, pubkey, identifier } = args;

      const relay = nostr.relay(revisionsRelay);
      const events = await reqAllVersions(
        relay,
        [{ kinds: [kind], authors: [pubkey], '#d': [identifier] }],
        AbortSignal.any([c.signal, AbortSignal.timeout(8000)]),
      );

      // Newest first.
      return events.sort((a, b) => b.created_at - a.created_at);
    },
    enabled: enabled && !!args && !!revisionsRelay,
    staleTime: 60 * 1000,
  });
}
