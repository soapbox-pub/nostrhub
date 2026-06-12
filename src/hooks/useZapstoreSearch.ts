import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';
import { nip19 } from 'nostr-tools';

/** kind number for NIP-82 / Zapstore Software Application events. */
export const ZAPSTORE_APP_KIND = 32267;

/** Minimal parsed representation of a kind 32267 Zapstore app listing. */
export interface ZapstoreApp {
  event: NostrEvent;
  pubkey: string;
  /** Package identifier (d tag), e.g. "to.treasures.app". */
  identifier: string;
  name: string;
  summary?: string;
  icon?: string;
  /** Address coordinate "32267:<pubkey>:<d>". */
  address: string;
  /** bech32 naddr for routing. */
  naddr: string;
}

function parseZapstoreApp(event: NostrEvent): ZapstoreApp | null {
  if (event.kind !== ZAPSTORE_APP_KIND) return null;
  const identifier = event.tags.find(([n]) => n === 'd')?.[1];
  if (!identifier) return null;

  const tag = (name: string) => event.tags.find(([n]) => n === name)?.[1];

  return {
    event,
    pubkey: event.pubkey,
    identifier,
    name: tag('name') ?? identifier,
    summary: tag('summary'),
    icon: tag('icon'),
    address: `${ZAPSTORE_APP_KIND}:${event.pubkey}:${identifier}`,
    naddr: nip19.naddrEncode({ kind: ZAPSTORE_APP_KIND, pubkey: event.pubkey, identifier }),
  };
}

/**
 * NIP-50 autocomplete search over Zapstore app listings (kind 32267).
 * Sent with `autocomplete:true` so partial words match while the user types.
 */
export function useZapstoreSearch(query: string, limit = 20) {
  const { nostr } = useNostr();
  const trimmed = query.trim();

  return useQuery<ZapstoreApp[]>({
    queryKey: ['zapstore-search', trimmed, limit],
    queryFn: async ({ signal }) => {
      if (!trimmed) return [];

      const events = await nostr.query(
        [{ kinds: [ZAPSTORE_APP_KIND], search: `autocomplete:true ${trimmed}`, limit }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) },
      );

      // Keep latest per (pubkey, d) address.
      const latest = new Map<string, NostrEvent>();
      for (const ev of events) {
        if (ev.kind !== ZAPSTORE_APP_KIND) continue;
        const d = ev.tags.find(([n]) => n === 'd')?.[1];
        if (!d) continue;
        const key = `${ev.pubkey}:${d}`;
        const prev = latest.get(key);
        if (!prev || ev.created_at > prev.created_at) latest.set(key, ev);
      }

      return Array.from(latest.values())
        .map(parseZapstoreApp)
        .filter((a): a is ZapstoreApp => a !== null);
    },
    enabled: trimmed.length > 0,
    staleTime: 30 * 1000,
  });
}

/**
 * Fetch Zapstore listings (kind 32267) authored by a specific pubkey.
 * Used to populate the "your listings" scrollbox in the submission form.
 */
export function useMyZapstoreApps(pubkey: string | undefined) {
  const { nostr } = useNostr();

  return useQuery<ZapstoreApp[]>({
    queryKey: ['zapstore-apps-by-author', pubkey],
    queryFn: async ({ signal }) => {
      const events = await nostr.query(
        [{ kinds: [ZAPSTORE_APP_KIND], authors: [pubkey!], limit: 100 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) },
      );

      const latest = new Map<string, NostrEvent>();
      for (const ev of events) {
        if (ev.kind !== ZAPSTORE_APP_KIND) continue;
        const d = ev.tags.find(([n]) => n === 'd')?.[1];
        if (!d) continue;
        const key = `${ev.pubkey}:${d}`;
        const prev = latest.get(key);
        if (!prev || ev.created_at > prev.created_at) latest.set(key, ev);
      }

      return Array.from(latest.values())
        .map(parseZapstoreApp)
        .filter((a): a is ZapstoreApp => a !== null)
        .sort((a, b) => b.event.created_at - a.event.created_at);
    },
    enabled: Boolean(pubkey),
    staleTime: 60 * 1000,
  });
}
