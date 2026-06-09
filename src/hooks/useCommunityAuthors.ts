import { useMemo } from 'react';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { useAppContext } from '@/hooks/useAppContext';
import { useExperts } from '@/hooks/useExperts';
import { useCurrentUser } from '@/hooks/useCurrentUser';

export interface CommunityAuthors {
  /** The final author set used as a spam-resistant `authors` filter for discussion. */
  authors: string[];
  /** Set form for fast membership checks. */
  authorSet: Set<string>;
  /** Map of pubkey -> number of experts who follow them (ranking signal). */
  followCounts: Map<string, number>;
}

/**
 * Derives the community author set from the configured experts:
 *
 * 1. Fetch the kind-3 follow list of every expert.
 * 2. Rank every followed pubkey by how many experts follow them (descending).
 * 3. Truncate to `config.communityCap` (or keep all when the cap is `null`).
 * 4. Always union in the experts themselves and the logged-in user.
 *
 * This set is intended primarily as the `authors` filter for discussion
 * queries, keeping conversation limited to the developer community.
 */
export function useCommunityAuthors() {
  const { nostr } = useNostr();
  const { config } = useAppContext();
  const { experts } = useExperts();
  const { user } = useCurrentUser();

  const cap = config.communityCap;
  const currentPubkey = user?.pubkey;

  // Stable key so the query re-runs when experts or cap change.
  const expertsKey = useMemo(() => [...experts].sort().join(','), [experts]);

  const query = useQuery<CommunityAuthors>({
    queryKey: ['community-authors', expertsKey, cap, currentPubkey ?? null],
    queryFn: async ({ signal }) => {
      const alwaysInclude = new Set<string>(experts);
      if (currentPubkey) alwaysInclude.add(currentPubkey);

      if (experts.length === 0) {
        const authors = Array.from(alwaysInclude);
        return { authors, authorSet: new Set(authors), followCounts: new Map() };
      }

      // Fetch experts' follow lists (kind 3). Latest per author is returned.
      const contactEvents = await nostr.query(
        [{ kinds: [3], authors: experts }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) },
      );

      // Keep only the newest kind-3 per expert.
      const latestByExpert = new Map<string, typeof contactEvents[number]>();
      for (const ev of contactEvents) {
        const prev = latestByExpert.get(ev.pubkey);
        if (!prev || ev.created_at > prev.created_at) {
          latestByExpert.set(ev.pubkey, ev);
        }
      }

      // Count how many experts follow each pubkey.
      const followCounts = new Map<string, number>();
      for (const ev of latestByExpert.values()) {
        // Dedupe within a single follow list.
        const followed = new Set<string>();
        for (const tag of ev.tags) {
          if (tag[0] === 'p' && typeof tag[1] === 'string' && tag[1].length === 64) {
            followed.add(tag[1]);
          }
        }
        for (const pk of followed) {
          followCounts.set(pk, (followCounts.get(pk) ?? 0) + 1);
        }
      }

      // Rank by expert-follow count (desc), then by pubkey for determinism.
      const ranked = Array.from(followCounts.entries())
        .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
        .map(([pk]) => pk);

      // Truncate to cap (null = no cap).
      const truncated = cap == null ? ranked : ranked.slice(0, Math.max(0, cap));

      // Union in experts + current user (may push past the cap).
      const authorSet = new Set<string>(truncated);
      for (const pk of alwaysInclude) authorSet.add(pk);

      return { authors: Array.from(authorSet), authorSet, followCounts };
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  return query;
}
