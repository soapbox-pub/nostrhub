import { useMemo, useState } from 'react';
import { useSeoMeta } from '@unhead/react';
import { Link } from 'react-router-dom';
import { PenLine, User, X } from 'lucide-react';
import { NipCard, NipCardSkeleton } from '@/components/NipCard';
import {
  DiscoveryGrid,
  DiscoveryPage,
  DiscoverySearch,
  FilterPill,
} from '@/components/DiscoveryGrid';
import { useOfficialNips } from '@/hooks/useOfficialNips';
import { useCustomNips } from '@/hooks/useCustomNips';
import { useCommunityAuthors } from '@/hooks/useCommunityAuthors';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import {
  officialToRanked,
  customToRanked,
  type RankedNip,
} from '@/hooks/useRankedNips';
import { Button } from '@/components/ui/button';

type Source = 'official' | 'community' | 'mine';

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
      'Browse Nostr Implementation Possibilities: the official protocol spec index alongside fresh drafts from the community.',
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
      if (source === 'mine' && nip.custom?.author !== user?.pubkey) return false;
      if (!q) return true;
      return (
        nip.title.toLowerCase().includes(q) ||
        (nip.number ? `nip-${nip.number}`.toLowerCase().includes(q) : false) ||
        (nip.number?.toLowerCase().includes(q) ?? false) ||
        (nip.kinds?.some((kind) => kind === q) ?? false) ||
        (nip.custom?.identifier.toLowerCase().includes(q) ?? false)
      );
    });
  }, [all, search, source, user?.pubkey]);

  const isLoading =
    source === 'official'
      ? officialQuery.isLoading
      : source === 'community' || source === 'mine'
        ? community.isLoading || customQuery.isLoading
        : officialQuery.isLoading && (community.isLoading || customQuery.isLoading);

  const hasAnything = all.length > 0;

  return (
    <DiscoveryPage
      title="NIPs"
      description="Nostr Implementation Possibilities: the official protocol index alongside fresh drafts from the community lab."
      action={
        user && (
          <Button asChild size="sm" className="gap-1.5 rounded-full shadow-lg shadow-primary/25">
            <Link to="/create">
              <PenLine className="size-4" />
              Draft a New NIP
            </Link>
          </Button>
        )
      }
      filters={
        <>
          <DiscoverySearch
            label="Search NIPs"
            placeholder="Search by number, title, or kind…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter NIPs">
            {user && (
              <FilterPill
                active={source === 'mine'}
                onClick={() => setSource(source === 'mine' ? undefined : 'mine')}
              >
                <User className="size-3" aria-hidden="true" />
                Your NIPs
                {source === 'mine' && <X className="size-3" aria-hidden="true" />}
              </FilterPill>
            )}
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
        </>
      }
    >
      <DiscoveryGrid
        items={filtered}
        isLoading={isLoading}
        getKey={(nip) => nip.key}
        renderItem={(nip) => <NipCard nip={nip} />}
        renderSkeleton={() => <NipCardSkeleton />}
        empty={
          source === 'mine'
            ? "You haven't drafted any NIPs yet."
            : hasAnything
              ? 'No NIPs match your search.'
              : 'No NIPs found. Try checking your relay connections or wait a moment for content to load.'
        }
      />
    </DiscoveryPage>
  );
}

export default NipsPage;
