import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';
import { DITTO_RELAY } from '@/lib/appRelays';
import { useAppContext } from '@/hooks/useAppContext';

export interface NipRevisionsArgs {
  kind: number;
  pubkey: string;
  identifier: string;
}

/**
 * Fetch every stored version of a replaceable/addressable event from the Ditto
 * relay, newest first.
 *
 * Ditto relays are special: when a filter matches the shape of a single Nostr
 * address (`kinds`/`authors`/`#d`) and carries a `limit` greater than 1 (or no
 * limit), they return *past* versions of replaceable and addressable events
 * rather than collapsing to the latest. We exploit that here to surface a
 * revision history. Querying the relay directly (not the default pool) keeps the
 * behavior deterministic — other relays would only ever return the latest event.
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
      // limit > 1 is what triggers Ditto's historical-version behavior.
      const events = await relay.query(
        [{ kinds: [kind], authors: [pubkey], '#d': [identifier], limit: 100 }],
        { signal: AbortSignal.any([c.signal, AbortSignal.timeout(8000)]) },
      );

      // Newest first; de-duplicate by event id in case the relay echoes one.
      const byId = new Map<string, NostrEvent>();
      for (const ev of events) {
        if (!byId.has(ev.id)) byId.set(ev.id, ev);
      }
      return Array.from(byId.values()).sort((a, b) => b.created_at - a.created_at);
    },
    enabled: enabled && !!args && !!revisionsRelay,
    staleTime: 60 * 1000,
  });
}
