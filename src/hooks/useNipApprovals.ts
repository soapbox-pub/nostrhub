import { useMemo } from 'react';
import { useNostr } from '@nostrify/react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useExperts } from '@/hooks/useExperts';
import {
  APPROVE_LABEL_NAMESPACE,
  APPROVE_LABEL_VALUE,
} from '@/lib/nips';

const NIPS_REPO_BASE = 'https://github.com/nostr-protocol/nips/blob/master';

/** A NIP that can be approved: either a community-authored event or an official NIP. */
export type NipTarget =
  | { type: 'custom'; address: string } // 30817:<pubkey>:<d>
  | { type: 'official'; number: string };

/** The label target tag key + value for a NIP target. */
function targetTag(target: NipTarget): [string, string] {
  if (target.type === 'custom') return ['a', target.address];
  return ['i', `${NIPS_REPO_BASE}/${target.number}.md`];
}

/** Stable key for a NIP target, used for maps and query keys. */
export function nipTargetKey(target: NipTarget): string {
  return target.type === 'custom' ? `a:${target.address}` : `nip:${target.number}`;
}

export interface ApprovalData {
  /** Distinct expert pubkeys that approved this NIP. */
  experts: string[];
  /** All distinct pubkeys that approved (experts + others). */
  all: string[];
  /** Expert approval count — the headline ranking signal. */
  expertCount: number;
  totalCount: number;
  /** Label event ids keyed by author pubkey (used to delete one's own approval). */
  eventIdsByAuthor: Record<string, string[]>;
}

export type ApprovalMap = Record<string, ApprovalData>;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Read `nostrhub.approve` labels (kind 1985) for one or more NIP targets.
 *
 * Approvals authored by configured experts are counted for ranking; the hook
 * also surfaces total approvals. Pass `expertsOnly` to restrict the relay query
 * to expert authors (used for homepage ranking sync).
 */
export function useNipApprovals(targets: NipTarget[], opts: { expertsOnly?: boolean } = {}) {
  const { nostr } = useNostr();
  const { experts, expertSet } = useExperts();
  const expertsOnly = opts.expertsOnly ?? false;

  const targetKeys = useMemo(() => targets.map(nipTargetKey).sort(), [targets]);
  const expertsKey = useMemo(() => [...experts].sort().join(','), [experts]);

  return useQuery<ApprovalMap>({
    queryKey: ['nip-approvals', expertsOnly, expertsKey, targetKeys.join('|')],
    queryFn: async ({ signal }) => {
      const result: ApprovalMap = {};
      for (const t of targets) {
        result[nipTargetKey(t)] = { experts: [], all: [], expertCount: 0, totalCount: 0, eventIdsByAuthor: {} };
      }
      if (targets.length === 0) return result;

      const customAddrs = targets.filter((t) => t.type === 'custom').map((t) => (t as { address: string }).address);
      const officialUrls = targets
        .filter((t) => t.type === 'official')
        .map((t) => `${NIPS_REPO_BASE}/${(t as { number: string }).number}.md`);

      const filters: NostrFilter[] = [];
      const base: Partial<NostrFilter> = {
        kinds: [1985],
        '#L': [APPROVE_LABEL_NAMESPACE],
        '#l': [APPROVE_LABEL_VALUE],
        limit: 2000,
      };
      if (expertsOnly && experts.length > 0) base.authors = experts;

      for (const addrs of chunk(customAddrs, 200)) {
        if (addrs.length) filters.push({ ...base, '#a': addrs } as NostrFilter);
      }
      for (const urls of chunk(officialUrls, 200)) {
        if (urls.length) filters.push({ ...base, '#i': urls } as NostrFilter);
      }
      if (filters.length === 0) return result;

      const events = await nostr.query(filters, {
        signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]),
      });

      // Map a label event to the target key(s) it references.
      const keyForUrl = (url: string): string | null => {
        const m = url.match(/\/([A-F0-9]+)\.md$/i);
        return m ? `nip:${m[1]}` : null;
      };

      // De-dupe per (target, author): one approval per author counts once.
      const seen = new Map<string, Set<string>>();
      // Track every label event id per (target, author) so a user can delete their own.
      const eventIds = new Map<string, Map<string, string[]>>();
      for (const ev of events) {
        for (const tagArr of ev.tags) {
          const [name, value] = tagArr;
          let key: string | null = null;
          if (name === 'a' && value) key = `a:${value}`;
          else if (name === 'i' && value) key = keyForUrl(value);
          if (!key || !(key in result)) continue;
          if (!seen.has(key)) seen.set(key, new Set());
          seen.get(key)!.add(ev.pubkey);
          if (!eventIds.has(key)) eventIds.set(key, new Map());
          const byAuthor = eventIds.get(key)!;
          if (!byAuthor.has(ev.pubkey)) byAuthor.set(ev.pubkey, []);
          byAuthor.get(ev.pubkey)!.push(ev.id);
        }
      }

      for (const [key, authors] of seen.entries()) {
        const all = Array.from(authors);
        const expertApprovers = all.filter((pk) => expertSet.has(pk));
        const eventIdsByAuthor: Record<string, string[]> = {};
        for (const [pk, ids] of eventIds.get(key) ?? []) eventIdsByAuthor[pk] = ids;
        result[key] = {
          experts: expertApprovers,
          all,
          expertCount: expertApprovers.length,
          totalCount: all.length,
          eventIdsByAuthor,
        };
      }

      return result;
    },
    staleTime: 60 * 1000,
  });
}

/** Publish a `nostrhub.approve` label (kind 1985) for a NIP target. */
export function useApproveNip() {
  const { mutateAsync: publish } = useNostrPublish();
  const queryClient = useQueryClient();

  return useMutation<NostrEvent, Error, NipTarget>({
    mutationFn: async (target) => {
      const tags: string[][] = [
        ['L', APPROVE_LABEL_NAMESPACE],
        ['l', APPROVE_LABEL_VALUE, APPROVE_LABEL_NAMESPACE],
        targetTag(target),
      ];
      return publish({ kind: 1985, content: '', tags });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nip-approvals'] });
    },
  });
}

/**
 * Remove a `nostrhub.approve` label by requesting deletion (NIP-09 kind 5) of
 * the user's own kind-1985 label event(s) for a NIP target.
 */
export function useUnapproveNip() {
  const { mutateAsync: publish } = useNostrPublish();
  const queryClient = useQueryClient();

  return useMutation<NostrEvent, Error, { eventIds: string[] }>({
    mutationFn: async ({ eventIds }) => {
      if (eventIds.length === 0) throw new Error('No approval to remove');
      const tags: string[][] = [
        ...eventIds.map((id) => ['e', id]),
        ['k', '1985'],
      ];
      return publish({ kind: 5, content: '', tags });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nip-approvals'] });
    },
  });
}
