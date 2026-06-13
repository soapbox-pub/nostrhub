import { useNostr } from '@nostrify/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { nip19 } from 'nostr-tools';
import type { NostrFilter } from '@nostrify/nostrify';
import { CUSTOM_NIP_KIND, isValidCustomNip, parseCustomNip, type CustomNip } from '@/lib/nips';

export interface UseCustomNipsOptions {
  /** Restrict to these author pubkeys (e.g. the community author set). */
  authors?: string[];
  /** Restrict to NIPs concerning a specific event kind (`#k` filter). */
  kind?: string;
  limit?: number;
  enabled?: boolean;
}

/** Query community-authored NIPs (kind 30817), newest first. */
export function useCustomNips(options: UseCustomNipsOptions = {}) {
  const { nostr } = useNostr();
  const { authors, kind, limit = 100, enabled = true } = options;

  return useQuery<CustomNip[]>({
    queryKey: ['custom-nips', authors ? [...authors].sort() : null, kind ?? null, limit],
    queryFn: async ({ signal }) => {
      const filter: NostrFilter = { kinds: [CUSTOM_NIP_KIND], limit };
      if (authors && authors.length > 0) filter.authors = authors;
      if (kind) filter['#k'] = [kind];

      const events = await nostr.query([filter], {
        signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
      });

      // Keep only the latest event per (author, d) address.
      const latest = new Map<string, (typeof events)[number]>();
      for (const ev of events) {
        if (!isValidCustomNip(ev)) continue;
        const d = ev.tags.find(([n]) => n === 'd')?.[1] ?? '';
        const key = `${ev.pubkey}:${d}`;
        const prev = latest.get(key);
        if (!prev || ev.created_at > prev.created_at) latest.set(key, ev);
      }

      return Array.from(latest.values())
        .map(parseCustomNip)
        .sort((a, b) => b.createdAt - a.createdAt);
    },
    enabled,
    staleTime: 60 * 1000,
  });
}

/** Fetch a single custom NIP by its address coordinate ("30817:<pubkey>:<d>"). */
export function useCustomNipByAddress(address: string | undefined) {
  const { nostr } = useNostr();
  const queryClient = useQueryClient();

  return useQuery<CustomNip | null>({
    queryKey: ['custom-nip-by-address', address ?? ''],
    queryFn: async ({ signal, queryKey }) => {
      if (!address) return null;
      const parts = address.split(':');
      if (parts.length !== 3 || parts[0] !== String(CUSTOM_NIP_KIND)) return null;
      const [, pubkey, identifier] = parts;

      const events = await nostr.query(
        [{ kinds: [CUSTOM_NIP_KIND], authors: [pubkey], '#d': [identifier], limit: 1 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) },
      );

      const event = events.find(isValidCustomNip);
      // Keep an optimistically-seeded NIP if the relay hasn't indexed it yet.
      if (!event) {
        return queryClient.getQueryData<CustomNip | null>(queryKey) ?? null;
      }
      return parseCustomNip(event);
    },
    enabled: !!address,
    staleTime: 60 * 1000,
  });
}

/** Fetch a single custom NIP by its naddr identifier. */
export function useCustomNip(naddr: string | undefined) {
  const { nostr } = useNostr();
  const queryClient = useQueryClient();

  return useQuery<CustomNip | null>({
    queryKey: ['custom-nip', naddr ?? ''],
    queryFn: async ({ signal, queryKey }) => {
      if (!naddr) return null;
      const decoded = nip19.decode(naddr);
      if (decoded.type !== 'naddr' || decoded.data.kind !== CUSTOM_NIP_KIND) {
        throw new Error('Not a custom NIP address');
      }
      const { pubkey, identifier } = decoded.data;

      const events = await nostr.query(
        [{ kinds: [CUSTOM_NIP_KIND], authors: [pubkey], '#d': [identifier], limit: 1 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) },
      );

      const event = events.find(isValidCustomNip);
      // Keep an optimistically-seeded NIP if the relay hasn't indexed it yet.
      if (!event) {
        return queryClient.getQueryData<CustomNip | null>(queryKey) ?? null;
      }
      return parseCustomNip(event);
    },
    enabled: !!naddr,
    staleTime: 60 * 1000,
  });
}
