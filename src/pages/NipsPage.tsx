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
import { useDirectoryNips } from '@/hooks/useDirectoryNips';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { type RankedNip } from '@/hooks/useRankedNips';
import { Button } from '@/components/ui/button';

type Source = 'official' | 'community' | 'mine';

function matchesSearch(nip: RankedNip, q: string): boolean {
  if (!q) return true;
  const codeLabel = nip.target.type === 'bud' ? 'bud' : 'nip';
  return (
    nip.title.toLowerCase().includes(q) ||
    (nip.number ? `${codeLabel}-${nip.number}`.toLowerCase().includes(q) : false) ||
    (nip.number?.toLowerCase().includes(q) ?? false) ||
    (nip.kinds?.some((kind) => kind === q) ?? false) ||
    (nip.custom?.identifier.toLowerCase().includes(q) ?? false)
  );
}

function matchesBudSearch(bud: RankedNip, q: string): boolean {
  if (!q) return true;
  return (
    bud.title.toLowerCase().includes(q) ||
    `bud-${bud.number}`.toLowerCase().includes(q) ||
    (bud.number?.toLowerCase().includes(q) ?? false) ||
    (bud.kinds?.some((kind) => kind === q) ?? false)
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
  const [search, setSearch] = useState('');
  const [source, setSource] = useState<Source>();

  const { ranked, official, buds, isLoading, isOfficialLoading } = useDirectoryNips();

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

  // BUDs are surfaced as a dedicated section beneath the full NIP index when
  // the "Official" filter is active. (Approved BUDs already appear inline in
  // the default curated view via `ranked`.)
  const filteredBuds = useMemo(() => {
    if (source !== 'official') return [];
    const q = search.trim().toLowerCase();
    return buds.filter((bud) => matchesBudSearch(bud, q));
  }, [buds, source, search]);

  const hasAnything = (source === 'official' ? official : ranked).length > 0;
  return (
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

      {/* Blossom Upgrade Documents — a parallel spec family, shown beneath the
          full official NIP index. */}
      {source === 'official' && (isOfficialLoading || filteredBuds.length > 0) && (
        <section className="mt-12 space-y-4">
          <div className="space-y-1 border-t border-border/60 pt-8">
            <h2 className="font-display text-2xl font-bold tracking-tight">
              Blossom Specifications
            </h2>
            <p className="max-w-prose text-muted-foreground">
              BUDs (Blossom Upgrade Documents) define the Blossom protocol for storing
              blobs of data on media servers, addressed by their SHA-256 hash.
            </p>
          </div>
          <DiscoveryGrid
            items={filteredBuds}
            isLoading={isOfficialLoading}
            getKey={(bud) => bud.key}
            renderItem={(bud) => <NipCard nip={bud} />}
            renderSkeleton={() => <NipCardSkeleton />}
            empty="No BUDs match your search."
          />
        </section>
      )}
    </DiscoveryPage>
  );
}

export default NipsPage;
