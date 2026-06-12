import { useMemo } from 'react';
import { useOfficialNips, type OfficialNip } from '@/hooks/useOfficialNips';
import { useCustomNips } from '@/hooks/useCustomNips';
import { useNipApprovals, type NipTarget, nipTargetKey } from '@/hooks/useNipApprovals';
import { useExperts } from '@/hooks/useExperts';
import type { CustomNip } from '@/lib/nips';

export interface RankedNip {
  key: string;
  target: NipTarget;
  title: string;
  /** Official NIP number/code, when applicable. */
  number?: string;
  /** Underlying custom NIP, when applicable. */
  custom?: CustomNip;
  deprecated?: boolean;
  kinds?: string[];
  expertCount: number;
  totalCount: number;
  /** Pubkeys of experts who approved this NIP (for the avatar stack). */
  expertApprovers: string[];
  /** True when the NIP was authored by one of the configured experts. */
  expertAuthored?: boolean;
  /** Creation timestamp (custom NIP `created_at`); undefined for official NIPs. */
  createdAt?: number;
}

/** Adapt an official NIP into the shape `NipCard` renders (no approval data). */
export function officialToRanked(nip: OfficialNip): RankedNip {
  const target = { type: 'official', number: nip.number } as const;
  return {
    key: nipTargetKey(target),
    target,
    title: nip.title,
    number: nip.number,
    deprecated: nip.deprecated,
    kinds: nip.eventKinds?.map((ek) => ek.kind),
    expertCount: 0,
    totalCount: 0,
    expertApprovers: [],
  };
}

/** Adapt a community NIP into the shape `NipCard` renders (no approval data). */
export function customToRanked(nip: CustomNip): RankedNip {
  const target = { type: 'custom', address: nip.address } as const;
  return {
    key: nipTargetKey(target),
    target,
    title: nip.title,
    custom: nip,
    kinds: nip.kinds,
    expertCount: 0,
    totalCount: 0,
    expertApprovers: [],
    createdAt: nip.createdAt,
  };
}

/**
 * Unified, ranked list of NIPs (official + community), ordered by how many
 * experts have applied a `nostrhub.approve` label (the homepage curation
 * signal). Approvals are synced from experts only. A NIP authored by an expert
 * is treated as implicitly expert-endorsed and surfaces here as well.
 */
export function useRankedNips() {
  const officialQuery = useOfficialNips();
  const customQuery = useCustomNips({ limit: 200 });
  const { expertSet } = useExperts();

  const official = officialQuery.data;
  const custom = customQuery.data;

  // Build the full set of approval targets.
  const targets = useMemo<NipTarget[]>(() => {
    const t: NipTarget[] = [];
    for (const nip of official ?? []) t.push({ type: 'official', number: nip.number });
    for (const nip of custom ?? []) t.push({ type: 'custom', address: nip.address });
    return t;
  }, [official, custom]);

  const approvalsQuery = useNipApprovals(targets, { expertsOnly: true });
  const approvals = approvalsQuery.data;

  const ranked = useMemo<RankedNip[]>(() => {
    if (!official && !custom) return [];

    const items: RankedNip[] = [];

    for (const nip of official ?? []) {
      const target: NipTarget = { type: 'official', number: nip.number };
      const a = approvals?.[nipTargetKey(target)];
      items.push({
        key: nipTargetKey(target),
        target,
        title: nip.title,
        number: nip.number,
        deprecated: nip.deprecated,
        kinds: nip.eventKinds?.map((ek) => ek.kind),
        expertCount: a?.expertCount ?? 0,
        totalCount: a?.totalCount ?? 0,
        expertApprovers: a?.experts ?? [],
      });
    }

    for (const nip of custom ?? []) {
      const target: NipTarget = { type: 'custom', address: nip.address };
      const a = approvals?.[nipTargetKey(target)];
      const expertAuthored = expertSet.has(nip.author);
      // An expert authoring a NIP counts as an implicit expert endorsement.
      // Only add to the count if that expert hasn't also explicitly approved.
      const authoredBonus =
        expertAuthored && !a?.experts.includes(nip.author) ? 1 : 0;
      const expertApprovers =
        authoredBonus > 0 ? [nip.author, ...(a?.experts ?? [])] : a?.experts ?? [];
      items.push({
        key: nipTargetKey(target),
        target,
        title: nip.title,
        custom: nip,
        kinds: nip.kinds,
        expertCount: (a?.expertCount ?? 0) + authoredBonus,
        totalCount: (a?.totalCount ?? 0) + authoredBonus,
        expertApprovers,
        expertAuthored,
      });
    }

    // Surface NIPs with at least one expert approval or authored by an expert.
    return items
      .filter((item) => item.expertCount > 0 || item.expertAuthored)
      .sort((a, b) => {
        if (b.expertCount !== a.expertCount) return b.expertCount - a.expertCount;
        if (b.totalCount !== a.totalCount) return b.totalCount - a.totalCount;
        // Tie-break: official by number asc, then title.
        if (a.number && b.number) return a.number.localeCompare(b.number);
        return a.title.localeCompare(b.title);
      });
  }, [official, custom, approvals, expertSet]);

  return {
    ranked,
    isLoading: officialQuery.isLoading || customQuery.isLoading || approvalsQuery.isLoading,
    isError: officialQuery.isError,
  };
}
