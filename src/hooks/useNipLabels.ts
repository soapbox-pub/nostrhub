import { useMemo } from 'react';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrFilter } from '@nostrify/nostrify';
import { useCommunityAuthors } from '@/hooks/useCommunityAuthors';
import { useExperts } from '@/hooks/useExperts';
import {
  APPROVE_LABEL_NAMESPACE,
  APPROVE_LABEL_VALUE,
} from '@/lib/nips';
import { nipNumberFromUrl } from '@/lib/apps';
import { type NipTarget, nipTargetKey } from '@/hooks/useNipApprovals';

export interface NipLabel {
  target: NipTarget;
  key: string;
  /** Distinct expert pubkeys that approved this NIP. */
  experts: string[];
  /** All distinct pubkeys that approved (experts + others). */
  all: string[];
  expertCount: number;
  totalCount: number;
}

export interface NipLabels {
  /** Approval data keyed by `nipTargetKey(target)`. */
  byKey: Record<string, NipLabel>;
  /** All targets that carry at least one label. */
  targets: NipTarget[];
}

/**
 * Fetch every `nostrhub.approve` label (kind 1985) authored by the community
 * author set (experts + experts' follows), then aggregate approvals per NIP
 * target. Unlike {@link useNipApprovals} this is not scoped to a known set of
 * targets — it discovers which NIPs have been labeled so the directory can
 * surface them (waterfall-fetching the underlying NIP events as needed).
 */
export function useNipLabels() {
  const { nostr } = useNostr();
  const { expertSet } = useExperts();
  const community = useCommunityAuthors();

  const authors = community.data?.authors;
  const authorsKey = useMemo(
    () => (authors ? [...authors].sort().join(',') : ''),
    [authors],
  );

  return useQuery<NipLabels>({
    queryKey: ['nip-labels', authorsKey],
    queryFn: async ({ signal }) => {
      const filter: NostrFilter = {
        kinds: [1985],
        '#L': [APPROVE_LABEL_NAMESPACE],
        '#l': [APPROVE_LABEL_VALUE],
        limit: 2000,
      };
      if (authors && authors.length > 0) filter.authors = authors;

      const events = await nostr.query([filter], {
        signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]),
      });

      // De-dupe per (target, author): one approval per author counts once.
      const seen = new Map<string, { target: NipTarget; authors: Set<string> }>();

      const note = (target: NipTarget, pubkey: string) => {
        const key = nipTargetKey(target);
        const entry = seen.get(key);
        if (entry) entry.authors.add(pubkey);
        else seen.set(key, { target, authors: new Set([pubkey]) });
      };

      for (const ev of events) {
        for (const [name, value] of ev.tags) {
          if (name === 'a' && value) {
            note({ type: 'custom', address: value }, ev.pubkey);
          } else if (name === 'i' && value) {
            const number = nipNumberFromUrl(value);
            if (number) note({ type: 'official', number }, ev.pubkey);
          }
        }
      }

      const byKey: Record<string, NipLabel> = {};
      const targets: NipTarget[] = [];
      for (const [key, { target, authors: pubkeys }] of seen.entries()) {
        const all = Array.from(pubkeys);
        const experts = all.filter((pk) => expertSet.has(pk));
        byKey[key] = {
          target,
          key,
          experts,
          all,
          expertCount: experts.length,
          totalCount: all.length,
        };
        targets.push(target);
      }

      return { byKey, targets };
    },
    enabled: !community.isLoading,
    staleTime: 60 * 1000,
  });
}
