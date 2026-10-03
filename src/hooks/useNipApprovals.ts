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
import { budGithubUrl, budNumberFromUrl, isBudUrl } from '@/lib/apps';

const NIPS_REPO_BASE = 'https://github.com/nostr-protocol/nips/blob/master';

/** One specific revision of a community NIP. */
export interface NipRevision {
  id: string;
  createdAt: number;
}

/**
 * A NIP that can be approved: a community-authored event, an official NIP, or a
 * Blossom BUD. A custom target may carry the revision being viewed: approvals
 * then pin that revision (`e` tag), and approvals of other revisions are
 * reported as stale.
 */
export type NipTarget =
  | { type: 'custom'; address: string; revision?: NipRevision } // 30817:<pubkey>:<d>
  | { type: 'official'; number: string }
  | { type: 'bud'; number: string };

/** The label target tag key + value for a NIP target. */
function targetTag(target: NipTarget): [string, string] {
  if (target.type === 'custom') return ['a', target.address];
  if (target.type === 'bud') return ['i', budGithubUrl(target.number)];
  return ['i', `${NIPS_REPO_BASE}/${target.number}.md`];
}

/** Stable key for a NIP target, used for maps and query keys. */
export function nipTargetKey(target: NipTarget): string {
  if (target.type === 'custom') return `a:${target.address}`;
  if (target.type === 'bud') return `bud:${target.number}`;
  return `nip:${target.number}`;
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
  /**
   * Approvers whose latest approval is for an earlier revision than the one
   * the target pins. Only computed for custom targets that carry a revision.
   */
  staleAuthors: string[];
}

/**
 * Whether an approval covers `revision`. Approvals pinning a revision (`e` tag)
 * must match it exactly; legacy approvals without one are judged by time — an
 * approval published before the revision existed can't have covered it.
 */
function approvalCoversRevision(approval: NostrEvent, revision: NipRevision): boolean {
  const pinned = approval.tags.find(([n]) => n === 'e')?.[1];
  if (pinned) return pinned === revision.id;
  return approval.created_at >= revision.createdAt;
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

  const targetKeys = useMemo(
    () =>
      targets
        .map((t) => (t.type === 'custom' && t.revision ? `${nipTargetKey(t)}@${t.revision.id}` : nipTargetKey(t)))
        .sort(),
    [targets],
  );
  const expertsKey = useMemo(() => [...experts].sort().join(','), [experts]);

  return useQuery<ApprovalMap>({
    queryKey: ['nip-approvals', expertsOnly, expertsKey, targetKeys.join('|')],
    queryFn: async ({ signal }) => {
      const result: ApprovalMap = {};
      const revisions = new Map<string, NipRevision>();
      for (const t of targets) {
        result[nipTargetKey(t)] = {
          experts: [],
          all: [],
          expertCount: 0,
          totalCount: 0,
          eventIdsByAuthor: {},
          staleAuthors: [],
        };
        if (t.type === 'custom' && t.revision) revisions.set(nipTargetKey(t), t.revision);
      }
      if (targets.length === 0) return result;

      const customAddrs = targets.filter((t) => t.type === 'custom').map((t) => (t as { address: string }).address);
      const officialUrls = targets
        .filter((t) => t.type === 'official')
        .map((t) => `${NIPS_REPO_BASE}/${(t as { number: string }).number}.md`);
      const budUrls = targets
        .filter((t) => t.type === 'bud')
        .map((t) => budGithubUrl((t as { number: string }).number));

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
      for (const urls of chunk([...officialUrls, ...budUrls], 200)) {
        if (urls.length) filters.push({ ...base, '#i': urls } as NostrFilter);
      }
      if (filters.length === 0) return result;

      const events = await nostr.query(filters, {
        signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]),
      });

      // Map a label event to the target key(s) it references.
      const keyForUrl = (url: string): string | null => {
        if (isBudUrl(url)) {
          const num = budNumberFromUrl(url);
          return num ? `bud:${num}` : null;
        }
        const m = url.match(/\/([A-F0-9]+)\.md$/i);
        return m ? `nip:${m[1]}` : null;
      };

      // De-dupe per (target, author): one approval per author counts once.
      const seen = new Map<string, Set<string>>();
      // Track every label event id per (target, author) so a user can delete their own.
      const eventIds = new Map<string, Map<string, string[]>>();
      // Each author's newest approval per target, to judge which revision it covers.
      const latestByAuthor = new Map<string, Map<string, NostrEvent>>();
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
          if (!latestByAuthor.has(key)) latestByAuthor.set(key, new Map());
          const latest = latestByAuthor.get(key)!;
          const prev = latest.get(ev.pubkey);
          if (!prev || ev.created_at > prev.created_at) latest.set(ev.pubkey, ev);
        }
      }

      for (const [key, authors] of seen.entries()) {
        const all = Array.from(authors);
        const expertApprovers = all.filter((pk) => expertSet.has(pk));
        const eventIdsByAuthor: Record<string, string[]> = {};
        for (const [pk, ids] of eventIds.get(key) ?? []) eventIdsByAuthor[pk] = ids;
        const revision = revisions.get(key);
        const staleAuthors = revision
          ? [...(latestByAuthor.get(key) ?? [])]
              .filter(([, ev]) => !approvalCoversRevision(ev, revision))
              .map(([pk]) => pk)
          : [];
        result[key] = {
          experts: expertApprovers,
          all,
          expertCount: expertApprovers.length,
          totalCount: all.length,
          eventIdsByAuthor,
          staleAuthors,
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
  const { expertSet } = useExperts();

  return useMutation<NostrEvent, Error, NipTarget>({
    mutationFn: async (target) => {
      const tags: string[][] = [
        ['L', APPROVE_LABEL_NAMESPACE],
        ['l', APPROVE_LABEL_VALUE, APPROVE_LABEL_NAMESPACE],
        targetTag(target),
      ];
      // For community NIPs, also tag the target event's author so the
      // approval surfaces in their notifications. Official NIPs have no
      // Nostr author, so no `p` tag applies.
      if (target.type === 'custom') {
        // Pin the exact revision being approved, so later edits don't
        // silently inherit the approval.
        if (target.revision) tags.push(['e', target.revision.id]);
        const authorPubkey = target.address.split(':')[1];
        if (authorPubkey) tags.push(['p', authorPubkey]);
      }
      return publish({ kind: 1985, content: '', tags });
    },
    onSuccess: (event, target) => {
      const key = nipTargetKey(target);
      const isExpert = expertSet.has(event.pubkey);
      // Optimistically reflect the new approval across all cached
      // `nip-approvals` queries — relays may not have indexed it yet.
      queryClient.setQueriesData<ApprovalMap>({ queryKey: ['nip-approvals'] }, (prev) => {
        if (!prev || !(key in prev)) return prev;
        const entry = prev[key];
        if (entry.all.includes(event.pubkey)) {
          // Re-approving the current revision clears a stale approval.
          if (!entry.staleAuthors.includes(event.pubkey)) return prev;
          return {
            ...prev,
            [key]: {
              ...entry,
              staleAuthors: entry.staleAuthors.filter((pk) => pk !== event.pubkey),
              eventIdsByAuthor: {
                ...entry.eventIdsByAuthor,
                [event.pubkey]: [...(entry.eventIdsByAuthor[event.pubkey] ?? []), event.id],
              },
            },
          };
        }
        const all = [...entry.all, event.pubkey];
        const experts = isExpert ? [...entry.experts, event.pubkey] : entry.experts;
        return {
          ...prev,
          [key]: {
            ...entry,
            all,
            experts,
            expertCount: experts.length,
            totalCount: all.length,
            eventIdsByAuthor: {
              ...entry.eventIdsByAuthor,
              [event.pubkey]: [...(entry.eventIdsByAuthor[event.pubkey] ?? []), event.id],
            },
          },
        };
      });
      // Reconcile with the relay once it has had time to index the new
      // label. An immediate invalidation would refetch before propagation
      // and clobber the optimistic update with stale data.
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['nip-approvals'] });
      }, 4000);
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
    onSuccess: (event) => {
      // The deletion is authored by the current user, so remove their
      // approval from all cached `nip-approvals` queries immediately —
      // relays may not have processed the deletion yet.
      const pubkey = event.pubkey;
      queryClient.setQueriesData<ApprovalMap>({ queryKey: ['nip-approvals'] }, (prev) => {
        if (!prev) return prev;
        let changed = false;
        const next: ApprovalMap = {};
        for (const [key, entry] of Object.entries(prev)) {
          if (!entry.all.includes(pubkey)) {
            next[key] = entry;
            continue;
          }
          changed = true;
          const all = entry.all.filter((pk) => pk !== pubkey);
          const experts = entry.experts.filter((pk) => pk !== pubkey);
          const eventIdsByAuthor = { ...entry.eventIdsByAuthor };
          delete eventIdsByAuthor[pubkey];
          next[key] = {
            ...entry,
            all,
            experts,
            staleAuthors: entry.staleAuthors.filter((pk) => pk !== pubkey),
            expertCount: experts.length,
            totalCount: all.length,
            eventIdsByAuthor,
          };
        }
        return changed ? next : prev;
      });
      // Reconcile with the relay once it has had time to process the
      // deletion. An immediate invalidation would refetch before
      // propagation and clobber the optimistic update with stale data.
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['nip-approvals'] });
      }, 4000);
    },
  });
}
