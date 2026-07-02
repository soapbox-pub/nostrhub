import { useMemo, useState } from 'react';
import { useSeoMeta } from '@unhead/react';
import { Link, useSearchParams } from 'react-router-dom';
import { PenLine, User, X } from 'lucide-react';
import { NipCard, NipCardSkeleton } from '@/components/NipCard';
import {
  DiscoveryGrid,
  DiscoveryPage,
  DiscoverySearch,
  FilterPill,
} from '@/components/DiscoveryGrid';
import { useDirectoryNips } from '@/hooks/useDirectoryNips';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { type RankedNip } from '@/hooks/useRankedNips';
import { Button } from '@/components/ui/button';

type Source = 'official' | 'community' | 'mine';

const SOURCES: readonly Source[] = ['official', 'community', 'mine'];

function parseSource(value: string | null): Source | undefined {
  return SOURCES.includes(value as Source) ? (value as Source) : undefined;
}

function matchesSearch(nip: RankedNip, q: string): boolean {
  if (!q) return true;
  return (
    nip.title.toLowerCase().includes(q) ||
    (nip.number ? `nip-${nip.number}`.toLowerCase().includes(q) : false) ||
    (nip.number?.toLowerCase().includes(q) ?? false) ||
    (nip.kinds?.some((kind) => kind === q) ?? false) ||
    (nip.custom?.identifier.toLowerCase().includes(q) ?? false)
  );
}

/**
 * Directory of NIPs. The default view is curated: NIPs surfaced by community
 * `nostrhub.approve` labels alongside the latest community drafts, ranked by
 * approval weight then recency. The full official index is only shown when the
 * "Official" filter is selected.
 */
export function NipsPage() {
  const { user } = useCurrentUser();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');

  // The active source filter is mirrored to the `?filter=` query param via
  // replaceState so the selected toggle survives copying the URL and browser
  // back/forward navigation without polluting the history stack.
  const source = parseSource(searchParams.get('filter'));
  const setSource = (next?: Source) => {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      if (next) params.set('filter', next);
      else params.delete('filter');
      return params;
    }, { replace: true });
  };

  const { ranked, official, isLoading, isOfficialLoading } = useDirectoryNips();

  useSeoMeta({
    title: 'NIPs | NostrHub',
    description:
      'Browse Nostr Implementation Possibilities: community-curated specs and fresh drafts, ranked by expert approval.',
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    // "Official" swaps to the full README index; every other view draws from
    // the curated, label-ranked list.
    const base = source === 'official' ? official : ranked;

    return base.filter((nip) => {
      if (source === 'community' && !nip.custom) return false;
      if (source === 'mine' && nip.custom?.author !== user?.pubkey) return false;
      return matchesSearch(nip, q);
    });
  }, [ranked, official, search, source, user?.pubkey]);

  const hasAnything = (source === 'official' ? official : ranked).length > 0;  return (
    <DiscoveryPage
      title="NIPs"
      description="Nostr Implementation Possibilities: community-curated specs and fresh drafts from the lab, ranked by expert approval."
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
                My NIPs
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
                  {value === 'official' ? 'Official' : 'Community'}
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
        isLoading={source === 'official' ? isOfficialLoading : isLoading}
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
