import { useMemo, useState } from 'react';
import { useSeoMeta } from '@unhead/react';
import { Link } from 'react-router-dom';
import { PenLine, X } from 'lucide-react';
import { Layout } from '@/components/Layout';
import { NipCard, NipCardSkeleton } from '@/components/NipCard';
import { DiscoveryGrid, DiscoverySearch, FilterPill } from '@/components/DiscoveryGrid';
import { useOfficialNips } from '@/hooks/useOfficialNips';
import { useCustomNips } from '@/hooks/useCustomNips';
import { useCommunityAuthors } from '@/hooks/useCommunityAuthors';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { nipTargetKey } from '@/hooks/useNipApprovals';
import type { RankedNip } from '@/hooks/useRankedNips';
import type { OfficialNip } from '@/hooks/useOfficialNips';
import type { CustomNip } from '@/lib/nips';
import { Button } from '@/components/ui/button';

type Source = 'official' | 'community';

/** Adapt an official NIP into the shape `NipCard` renders. */
function officialToRanked(nip: OfficialNip): RankedNip {
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

/** Adapt a community NIP draft into the shape `NipCard` renders. */
function customToRanked(nip: CustomNip): RankedNip {
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
  };
}

/** Directory of all NIPs: the official index plus community drafts. */
export function NipsPage() {
  const { user } = useCurrentUser();
  const [search, setSearch] = useState('');
  const [source, setSource] = useState<Source>();

  const officialQuery = useOfficialNips();
  const community = useCommunityAuthors();
  const customQuery = useCustomNips({
    authors: community.data?.authors,
    limit: 200,
    enabled: !community.isLoading,
  });

  useSeoMeta({
    title: 'NIPs | NostrHub',
    description:
      'Browse Nostr Implementation Possibilities — the official protocol spec index alongside fresh drafts from the community.',
  });

  // Official NIPs keep their README (index) order; community drafts are
  // already newest-first and follow after.
  const all = useMemo<RankedNip[]>(() => {
    const official = (officialQuery.data ?? []).map(officialToRanked);
    const custom = (customQuery.data ?? []).map(customToRanked);
    return [...official, ...custom];
  }, [officialQuery.data, customQuery.data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter((nip) => {
      if (source === 'official' && nip.custom) return false;
      if (source === 'community' && !nip.custom) return false;
      if (!q) return true;
      return (
        nip.title.toLowerCase().includes(q) ||
        (nip.number ? `nip-${nip.number}`.toLowerCase().includes(q) : false) ||
        (nip.number?.toLowerCase().includes(q) ?? false) ||
        (nip.kinds?.some((kind) => kind === q) ?? false) ||
        (nip.custom?.identifier.toLowerCase().includes(q) ?? false)
      );
    });
  }, [all, search, source]);

  const isLoading =
    source === 'official'
      ? officialQuery.isLoading
      : source === 'community'
        ? community.isLoading || customQuery.isLoading
        : officialQuery.isLoading && (community.isLoading || customQuery.isLoading);

  const hasAnything = all.length > 0;

  return (
    <Layout>
      <div className="space-y-8">
        <header className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
              <span className="text-cosmic">NIPs</span>
            </h1>
            {user && (
              <Button asChild size="sm" className="gap-1.5 rounded-full shadow-lg shadow-primary/25">
                <Link to="/create">
                  <PenLine className="size-4" />
                  Draft a New NIP
                </Link>
              </Button>
            )}
          </div>
          <p className="max-w-prose text-lg text-muted-foreground">
            Nostr Implementation Possibilities — the official protocol index alongside fresh
            drafts from the community lab.
          </p>
        </header>

        <div className="space-y-3">
          <DiscoverySearch
            label="Search NIPs"
            placeholder="Search by number, title, or kind…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter NIPs">
            {(['official', 'community'] as const).map((value) => {
              const active = source === value;
              return (
                <FilterPill
                  key={value}
                  active={active}
                  onClick={() => setSource(active ? undefined : value)}
                >
                  {value === 'official' ? 'Official' : 'Community drafts'}
                  {active && <X className="size-3" aria-hidden="true" />}
                </FilterPill>
              );
            })}
          </div>
        </div>

        <DiscoveryGrid
          items={filtered}
          isLoading={isLoading}
          getKey={(nip) => nip.key}
          renderItem={(nip) => <NipCard nip={nip} />}
          renderSkeleton={() => <NipCardSkeleton />}
          empty={
            hasAnything
              ? 'No NIPs match your search.'
              : 'No NIPs found. Try checking your relay connections or wait a moment for content to load.'
          }
        />
      </div>
    </Layout>
  );
}

export default NipsPage;
