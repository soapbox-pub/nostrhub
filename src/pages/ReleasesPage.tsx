import { Link, useSearchParams } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { PlusCircle, X } from 'lucide-react';
import {
  DiscoveryGrid,
  DiscoveryPage,
  FilterPill,
} from '@/components/DiscoveryGrid';
import { ReleaseListingCard, ReleaseListingCardSkeleton } from '@/components/ReleaseListingCard';
import { useZapstoreReleasesByTag } from '@/hooks/useZapstoreSearch';
import { Button } from '@/components/ui/button';

/** A focused set of common Zapstore categories surfaced as quick filters. */
const SUGGESTED_TAGS = [
  'nostr',
  'social',
  'messaging',
  'media',
  'tools',
  'productivity',
  'games',
  'finance',
  'maps',
  'privacy',
];

/**
 * Browse Zapstore software releases (kind 30063) by category. Listings
 * (kind 32267) are filtered at the relay by their `t` tag and paired with
 * their latest release.
 */
export function ReleasesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTag = searchParams.get('tag')?.trim().toLowerCase() || undefined;

  const setActiveTag = (tag?: string) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (tag) next.set('tag', tag);
        else next.delete('tag');
        return next;
      },
      { replace: true },
    );
  };

  const { data: listings, isLoading } = useZapstoreReleasesByTag(activeTag);

  useSeoMeta({
    title: activeTag ? `#${activeTag} Releases | NostrHub` : 'Releases | NostrHub',
    description:
      'Browse software releases published to Zapstore on Nostr. Filter by category to discover apps.',
  });

  return (
    <DiscoveryPage
      title="Releases"
      description="Software shipped to Zapstore on Nostr. Each listing links to its in-app page with release notes, screenshots, and a direct download."
      action={
        <Button asChild variant="outline" className="gap-1.5">
          <Link to="/apps/submit">
            <PlusCircle className="size-4" aria-hidden="true" />
            Submit an app
          </Link>
        </Button>
      }
      filters={
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter releases by category">
          {activeTag && !SUGGESTED_TAGS.includes(activeTag) && (
            <FilterPill active onClick={() => setActiveTag(undefined)}>
              #{activeTag}
              <X className="size-3" aria-hidden="true" />
            </FilterPill>
          )}
          {SUGGESTED_TAGS.map((tag) => {
            const isActive = tag === activeTag;
            return (
              <FilterPill
                key={tag}
                active={isActive}
                onClick={() => setActiveTag(isActive ? undefined : tag)}
              >
                #{tag}
                {isActive && <X className="size-3" aria-hidden="true" />}
              </FilterPill>
            );
          })}
        </div>
      }
    >
      <DiscoveryGrid
        items={listings}
        isLoading={isLoading}
        getKey={(listing) => listing.app.address}
        renderItem={(listing) => <ReleaseListingCard listing={listing} />}
        renderSkeleton={() => <ReleaseListingCardSkeleton />}
        empty={
          activeTag
            ? `No releases tagged #${activeTag}. Try another category or clear the filter.`
            : 'No releases found. Try checking your relay connections or wait a moment for content to load.'
        }
      />
    </DiscoveryPage>
  );
}

export default ReleasesPage;
