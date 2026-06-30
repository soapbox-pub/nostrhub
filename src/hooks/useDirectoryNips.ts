import { useMemo } from 'react';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrFilter } from '@nostrify/nostrify';
import { useOfficialNips, type OfficialNip } from '@/hooks/useOfficialNips';
import { useBuds, type Bud } from '@/hooks/useBuds';
import { useCustomNips } from '@/hooks/useCustomNips';
import { useCommunityAuthors } from '@/hooks/useCommunityAuthors';
import { useNipLabels, type NipLabels } from '@/hooks/useNipLabels';
import { useExperts } from '@/hooks/useExperts';
import { nipTargetKey, type NipTarget } from '@/hooks/useNipApprovals';
import { officialToRanked, budToRanked, type RankedNip } from '@/hooks/useRankedNips';
import {
  CUSTOM_NIP_KIND,
  isValidCustomNip,
  parseCustomNip,
  type CustomNip,
} from '@/lib/nips';

/**
 * Waterfall-fetch the community NIP events referenced by labels that aren't
 * already present in the latest-community-NIPs result. Labels point at custom
 * NIPs via their `30817:<pubkey>:<d>` address coordinate.
 */
function useLabeledCustomNips(
  labels: NipLabels | undefined,
  knownAddresses: Set<string>,
) {
  const { nostr } = useNostr();

  const missing = useMemo(() => {
    if (!labels) return [];
    const addrs = new Set<string>();
    for (const target of labels.targets) {
      if (target.type === 'custom' && !knownAddresses.has(target.address)) {
        addrs.add(target.address);
      }
    }
    return Array.from(addrs).sort();
  }, [labels, knownAddresses]);

  return useQuery<CustomNip[]>({
    queryKey: ['labeled-custom-nips', missing.join('|')],
    queryFn: async ({ signal }) => {
      if (missing.length === 0) return [];

      // Group requested `d` identifiers by author so we can build compact
      // addressable filters (`authors` + `#d`).
      const byAuthor = new Map<string, string[]>();
      for (const address of missing) {
        const parts = address.split(':');
        if (parts.length !== 3 || parts[0] !== String(CUSTOM_NIP_KIND)) continue;
        const [, pubkey, identifier] = parts;
        const list = byAuthor.get(pubkey) ?? [];
        list.push(identifier);
        byAuthor.set(pubkey, list);
      }

      const filters: NostrFilter[] = Array.from(byAuthor.entries()).map(
        ([pubkey, ids]) => ({
          kinds: [CUSTOM_NIP_KIND],
          authors: [pubkey],
          '#d': ids,
        }),
      );
      if (filters.length === 0) return [];

      const events = await nostr.query(filters, {
        signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
      });

      // Keep the latest event per (author, d) address.
      const latest = new Map<string, (typeof events)[number]>();
      for (const ev of events) {
        if (!isValidCustomNip(ev)) continue;
        const d = ev.tags.find(([n]) => n === 'd')?.[1] ?? '';
        const key = `${ev.pubkey}:${d}`;
        const prev = latest.get(key);
        if (!prev || ev.created_at > prev.created_at) latest.set(key, ev);
      }

      return Array.from(latest.values()).map(parseCustomNip);
    },
    enabled: missing.length > 0,
    staleTime: 60 * 1000,
  });
}

export interface DirectoryNips {
  /** Ranked list for the default view: labeled NIPs + latest community NIPs. */
  ranked: RankedNip[];
  /** All official NIPs in README order (for the "Official" filter). */
  official: RankedNip[];
  /** All Blossom BUDs in README order (shown as a section under "Official"). */
  buds: RankedNip[];
  /** Loading state for the curated (default) view. */
  isLoading: boolean;
  /** Loading state for the official index alone. */
  isOfficialLoading: boolean;
  isError: boolean;
}

/**
 * Build the `/nips` directory listing.
 *
 * The default ("All") view is curated rather than exhaustive: it surfaces every
 * NIP that carries a `nostrhub.approve` label (official or community —
 * waterfall-fetched when not already loaded) merged with the latest community
 * drafts. The full official index is only materialized for the "Official"
 * filter. Everything is ranked by approval weight (experts first, then total
 * approvals) and finally by `created_at`.
 */
export function useDirectoryNips(): DirectoryNips {
  const officialQuery = useOfficialNips();
  const budsQuery = useBuds();
  const community = useCommunityAuthors();
  const customQuery = useCustomNips({
    authors: community.data?.authors,
    limit: 200,
    enabled: !community.isLoading,
  });
  const labelsQuery = useNipLabels();
  const { expertSet } = useExperts();

  const officialNips = officialQuery.data;
  const budsData = budsQuery.data;
  const customNips = customQuery.data;
  const labels = labelsQuery.data;

  // Addresses we already hold from the latest-community query.
  const knownAddresses = useMemo(
    () => new Set((customNips ?? []).map((nip) => nip.address)),
    [customNips],
  );

  const labeledCustomQuery = useLabeledCustomNips(labels, knownAddresses);

  const official = useMemo<RankedNip[]>(() => {
    const byKey = labels?.byKey ?? {};
    return (officialNips ?? []).map((nip) => {
      const base = officialToRanked(nip);
      const label = byKey[base.key];
      if (!label) return base;
      // Official NIPs have no author, so every approval counts.
      return {
        ...base,
        expertApprovers: label.experts ?? [],
        expertCount: label.experts?.length ?? 0,
        totalCount: label.all?.length ?? 0,
      };
    });
  }, [officialNips, labels]);

  const buds = useMemo<RankedNip[]>(() => {
    const byKey = labels?.byKey ?? {};
    return (budsData ?? []).map((bud) => {
      const base = budToRanked(bud);
      const label = byKey[base.key];
      if (!label) return base;
      // BUDs have no author, so every approval counts.
      return {
        ...base,
        expertApprovers: label.experts ?? [],
        expertCount: label.experts?.length ?? 0,
        totalCount: label.all?.length ?? 0,
      };
    });
  }, [budsData, labels]);

  // Index official NIPs by number for label lookups.
  const officialByNumber = useMemo(() => {
    const map = new Map<string, OfficialNip>();
    for (const nip of officialNips ?? []) map.set(nip.number, nip);
    return map;
  }, [officialNips]);

  // Index BUDs by number for label lookups.
  const budsByNumber = useMemo(() => {
    const map = new Map<string, Bud>();
    for (const bud of budsData ?? []) map.set(bud.number, bud);
    return map;
  }, [budsData]);

  const ranked = useMemo<RankedNip[]>(() => {
    const byKey = labels?.byKey ?? {};

    const items = new Map<string, RankedNip>();

    const applyApprovals = (
      base: Omit<RankedNip, 'expertCount' | 'totalCount' | 'expertApprovers'>,
      author?: string,
    ): RankedNip => {
      const label = byKey[base.key];
      // Approvals only count when they come from someone other than the
      // author: experts self-labeling their own NIPs is not an endorsement.
      const experts = (label?.experts ?? []).filter((pk) => pk !== author);
      const all = (label?.all ?? []).filter((pk) => pk !== author);
      return {
        ...base,
        expertAuthored: author ? expertSet.has(author) : false,
        expertApprovers: experts,
        expertCount: experts.length,
        totalCount: all.length,
      };
    };

    // 1. Latest community NIPs always appear.
    for (const nip of customNips ?? []) {
      const target: NipTarget = { type: 'custom', address: nip.address };
      const key = nipTargetKey(target);
      items.set(
        key,
        applyApprovals(
          {
            key,
            target,
            title: nip.title,
            custom: nip,
            kinds: nip.kinds,
            createdAt: nip.createdAt,
          },
          nip.author,
        ),
      );
    }

    // 2. Waterfall-fetched community NIPs referenced by labels.
    for (const nip of labeledCustomQuery.data ?? []) {
      const target: NipTarget = { type: 'custom', address: nip.address };
      const key = nipTargetKey(target);
      if (items.has(key)) continue;
      items.set(
        key,
        applyApprovals(
          {
            key,
            target,
            title: nip.title,
            custom: nip,
            kinds: nip.kinds,
            createdAt: nip.createdAt,
          },
          nip.author,
        ),
      );
    }

    // 3. Official NIPs that carry a label.
    for (const target of labels?.targets ?? []) {
      if (target.type !== 'official') continue;
      const key = nipTargetKey(target);
      if (items.has(key)) continue;
      const meta = officialByNumber.get(target.number);
      if (!meta) continue; // Official index not loaded / unknown NIP number.
      items.set(
        key,
        applyApprovals({
          key,
          target,
          title: meta.title,
          number: meta.number,
          deprecated: meta.deprecated,
          kinds: meta.eventKinds?.map((ek) => ek.kind),
        }),
      );
    }

    // 4. Blossom BUDs that carry a label.
    for (const target of labels?.targets ?? []) {
      if (target.type !== 'bud') continue;
      const key = nipTargetKey(target);
      if (items.has(key)) continue;
      const meta = budsByNumber.get(target.number);
      if (!meta) continue; // BUD index not loaded / unknown BUD number.
      items.set(
        key,
        applyApprovals({
          key,
          target,
          title: meta.title,
          number: meta.number,
          kinds: meta.eventKinds?.map((ek) => ek.kind),
        }),
      );
    }

    return Array.from(items.values()).sort((a, b) => {
      // Official NIPs and BUDs get a +1 ranking bonus over community drafts.
      const aOfficial = a.target.type !== 'custom' ? 1 : 0;
      const bOfficial = b.target.type !== 'custom' ? 1 : 0;
      const aExpert = a.expertCount + aOfficial;
      const bExpert = b.expertCount + bOfficial;
      if (bExpert !== aExpert) return bExpert - aExpert;
      const aTotal = a.totalCount + aOfficial;
      const bTotal = b.totalCount + bOfficial;
      if (bTotal !== aTotal) return bTotal - aTotal;
      // Newest first; official NIPs (no created_at) sort after dated drafts.
      return (b.createdAt ?? 0) - (a.createdAt ?? 0);
    });
  }, [
    customNips,
    labeledCustomQuery.data,
    labels,
    officialByNumber,
    budsByNumber,
    expertSet,
  ]);

  return {
    ranked,
    official,
    buds,
    isLoading:
      officialQuery.isLoading ||
      community.isLoading ||
      customQuery.isLoading ||
      labelsQuery.isLoading ||
      labeledCustomQuery.isLoading,
    isOfficialLoading: officialQuery.isLoading || budsQuery.isLoading,
    isError: officialQuery.isError,
  };
}
