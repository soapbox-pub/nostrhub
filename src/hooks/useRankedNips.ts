import { useMemo } from 'react';
import { useOfficialNips } from '@/hooks/useOfficialNips';
import { useCustomNips } from '@/hooks/useCustomNips';
import { useNipApprovals, type NipTarget, nipTargetKey } from '@/hooks/useNipApprovals';
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
}

/**
 * Unified, ranked list of NIPs (official + community), ordered by how many
 * experts have applied a `nostrhub.approve` label (the homepage curation
 * signal). Approvals are synced from experts only.
 */
export function useRankedNips() {
  const officialQuery = useOfficialNips();
  const customQuery = useCustomNips({ limit: 200 });

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
      });
    }

    for (const nip of custom ?? []) {
      const target: NipTarget = { type: 'custom', address: nip.address };
      const a = approvals?.[nipTargetKey(target)];
      items.push({
        key: nipTargetKey(target),
        target,
        title: nip.title,
        custom: nip,
        kinds: nip.kinds,
        expertCount: a?.expertCount ?? 0,
        totalCount: a?.totalCount ?? 0,
      });
    }

    // Only surface NIPs with at least one expert approval on the ranked list.
    return items
      .filter((item) => item.expertCount > 0)
      .sort((a, b) => {
        if (b.expertCount !== a.expertCount) return b.expertCount - a.expertCount;
        if (b.totalCount !== a.totalCount) return b.totalCount - a.totalCount;
        // Tie-break: official by number asc, then title.
        if (a.number && b.number) return a.number.localeCompare(b.number);
        return a.title.localeCompare(b.title);
      });
  }, [official, custom, approvals]);

  return {
    ranked,
    isLoading: officialQuery.isLoading || customQuery.isLoading || approvalsQuery.isLoading,
    isError: officialQuery.isError,
  };
}
