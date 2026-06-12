import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { Eye, HelpCircle, PlusCircle, User, X } from 'lucide-react';
import { AppCard, AppCardSkeleton } from '@/components/AppCard';
import {
  DiscoveryGrid,
  DiscoveryPage,
  DiscoverySearch,
  FilterPill,
} from '@/components/DiscoveryGrid';
import { TIER_ICONS } from '@/lib/tierIcons';
import { useAppSearch } from '@/hooks/useAppSearch';
import { useApps } from '@/hooks/useApps';
import { useAllAppReviews } from '@/hooks/useAppReviews';
import { useCommunityAuthors } from '@/hooks/useCommunityAuthors';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { APP_PLATFORMS, hasFullAppMetadata, type AppPlatform } from '@/lib/apps';
import {
  TIERS,
  TIER_ORDER,
  aggregateReviews,
  type AppRow,
  type CompatTier,
  type ReviewReport,
} from '@/lib/appReviews';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

const PLATFORM_LABELS: Record<AppPlatform, string> = {
  web: 'Web',
  ios: 'iOS',
  android: 'Android',
  desktop: 'Desktop',
  linux: 'Linux',
  macos: 'macOS',
  windows: 'Windows',
};

type TierFilter = CompatTier | 'all' | 'unrated';
type SortBy = 'hot' | 'newest' | 'name' | 'reports' | 'rating';

/** Debounce a string value so search REQs aren't fired on every keystroke. */
function useDebounced(value: string, delay = 400): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

/**
 * Directory of Nostr apps announced via NIP-89 handler events (kind 31990),
 * rated ProtonDB-style: kind 31986 compatibility reports (Borkstr-compatible)
 * are aggregated into per-NIP and overall tiers. Browsing pulls recent
 * listings from the pool; typing a search query switches to NIP-50 full-text
 * search against the dedicated search relays.
 */
export function AppsPage() {
  const { user } = useCurrentUser();
  const [search, setSearch] = useState('');
  const [platform, setPlatform] = useState<AppPlatform>();
  const [tierFilter, setTierFilter] = useState<TierFilter>('all');
  const [sortBy, setSortBy] = useState<SortBy>('hot');
  const [showHidden, setShowHidden] = useState(false);
  const [mineOnly, setMineOnly] = useState(false);

  const query = useDebounced(search).trim();
  const searching = query.length > 0;
  const mine = mineOnly && Boolean(user);

  // Restrict discovery to the community web-of-trust author set (the ~1000
  // pubkeys derived from the experts' follows) for spam resistance. Browse and
  // search both wait for the set to resolve before querying; "Your apps" is
  // already author-scoped to the user and bypasses it.
  const community = useCommunityAuthors();
  const communityAuthors = community.data?.authors;
  const communityReady = communityAuthors !== undefined;

  const browse = useAppSearch(communityReady ? 'sort:hot' : '', communityAuthors);
  const results = useAppSearch(searching && communityReady ? `${query} sort:hot` : '', communityAuthors);
  // "Your apps": author-scoped pool query (the hot/search lists may not
  // include the user's own listings), incomplete metadata included.
  const myApps = useApps({
    authors: user ? [user.pubkey] : [],
    requireFullMetadata: false,
    enabled: mine,
  });
  const reviews = useAllAppReviews();

  useSeoMeta({
    title: 'Apps | NostrHub',
    description:
      'Discover Nostr applications announced on the network via NIP-89. Search the directory and see how well each app implements the NIPs, ProtonDB-style.',
  });

  const active = mine ? myApps : searching ? results : browse;

  // Group every compatibility report by the app address it targets.
  const reviewsByApp = useMemo(() => {
    const map = new Map<string, ReviewReport[]>();
    for (const review of reviews.data ?? []) {
      const existing = map.get(review.appAddress) || [];
      existing.push(review);
      map.set(review.appAddress, existing);
    }
    return map;
  }, [reviews.data]);

  const rows: AppRow[] = useMemo(() => {
    return (active.data ?? []).map((app) => {
      const { perNip, overall } = aggregateReviews(reviewsByApp.get(app.address) || []);
      return { app, overall, perNip };
    });
  }, [active.data, reviewsByApp]);

  const { visibleRows, hiddenRows } = useMemo(() => {
    // "Your apps" shows everything the user has published, complete or not.
    if (mine) return { visibleRows: rows, hiddenRows: [] };
    const visible: AppRow[] = [];
    const hidden: AppRow[] = [];
    for (const row of rows) {
      if (hasFullAppMetadata(row.app)) visible.push(row);
      else hidden.push(row);
    }
    return { visibleRows: visible, hiddenRows: hidden };
  }, [rows, mine]);

  const filtered = useMemo(() => {
    let result = showHidden ? [...visibleRows, ...hiddenRows] : visibleRows;
    if (platform) {
      result = result.filter((r) => r.app.platforms.includes(platform));
    }
    if (tierFilter === 'unrated') {
      result = result.filter((r) => !r.overall);
    } else if (tierFilter !== 'all') {
      result = result.filter((r) => r.overall?.tier === tierFilter);
    }
    // "Your apps" comes from the pool, not the search relays, so the search
    // box filters it client-side.
    if (mine && query) {
      const q = query.toLowerCase();
      result = result.filter(
        (r) =>
          r.app.name.toLowerCase().includes(q) ||
          (r.app.about?.toLowerCase().includes(q) ?? false),
      );
    }

    // NIP-50 search results keep the relay's relevance ranking unless the
    // user picks an explicit sort.
    const sorted = [...result];
    if (sortBy === 'hot') {
      // Reviewed apps sorted by count × rating first; unreviewed apps keep
      // their relay-assigned order (position in the rows array) behind them.
      const reviewed = sorted.filter((r) => r.overall);
      const unreviewed = sorted.filter((r) => !r.overall);
      reviewed.sort((a, b) => {
        const aScore = a.overall!.count * a.overall!.rating;
        const bScore = b.overall!.count * b.overall!.rating;
        return bScore - aScore;
      });
      return [...reviewed, ...unreviewed];
    } else if (sortBy === 'name') {
      sorted.sort((a, b) => a.app.name.localeCompare(b.app.name));
    } else if (sortBy === 'reports') {
      sorted.sort((a, b) => (b.overall?.count ?? 0) - (a.overall?.count ?? 0));
    } else if (sortBy === 'rating') {
      sorted.sort((a, b) => (b.overall?.rating ?? -1) - (a.overall?.rating ?? -1));
    } else if (sortBy === 'newest') {
      sorted.sort((a, b) => b.app.createdAt - a.app.createdAt);
    }
    return sorted;
  }, [visibleRows, hiddenRows, platform, tierFilter, sortBy, showHidden, mine, query]);

  const isLoading =
    active.isLoading ||
    reviews.isLoading ||
    (!mine && !communityReady) ||
    (searching && search.trim() !== query);

  return (
    <DiscoveryPage
      title="Apps"
      description="Applications announced on Nostr itself. Every listing is a NIP-89 handler event, and the community rates how well each one implements the NIPs, ProtonDB-style."
      action={
        <Button asChild variant="outline" className="gap-1.5">
          <Link to="/apps/submit">
            <PlusCircle className="size-4" aria-hidden="true" />
            Add an app
          </Link>
        </Button>
      }
      filters={
        <>
          {/* Search + sort */}
          <div className="flex flex-col gap-2 sm:flex-row">
            <DiscoverySearch
              label="Search apps"
              placeholder="Search apps…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              containerClassName="flex-1 sm:max-w-md"
            />
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortBy)}>
              <SelectTrigger className="w-full sm:w-44" aria-label="Sort apps">
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="hot">Hot</SelectItem>
                <SelectItem value="newest">{searching ? 'Best Match' : 'Newest'}</SelectItem>
                <SelectItem value="name">Name</SelectItem>
                <SelectItem value="reports">Most Reports</SelectItem>
                <SelectItem value="rating">Highest Rated</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Tier filter pills (bespoke tier-colored styling) */}
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by compatibility tier">
            <button
              type="button"
              onClick={() => setTierFilter('all')}
              aria-pressed={tierFilter === 'all'}
              className={cn(
                'rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                tierFilter === 'all'
                  ? 'bg-foreground text-background'
                  : 'bg-muted/50 text-muted-foreground hover:bg-muted',
              )}
            >
              All
            </button>
            {TIER_ORDER.map((t) => {
              const Icon = TIER_ICONS[t];
              const isActive = tierFilter === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTierFilter(isActive ? 'all' : t)}
                  aria-pressed={isActive}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wider transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    !isActive && 'bg-muted/50 hover:bg-muted',
                  )}
                  style={isActive ? { backgroundColor: TIERS[t].color, color: '#fff' } : { color: TIERS[t].color }}
                >
                  <Icon className="size-3" aria-hidden="true" />
                  {TIERS[t].label}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setTierFilter(tierFilter === 'unrated' ? 'all' : 'unrated')}
              aria-pressed={tierFilter === 'unrated'}
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                tierFilter === 'unrated'
                  ? 'bg-muted-foreground text-background'
                  : 'bg-muted/50 text-muted-foreground hover:bg-muted',
              )}
            >
              <HelpCircle className="size-3" aria-hidden="true" />
              Unrated
            </button>
          </div>

          {/* Author + platform filter pills */}
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter apps">
            {user && (
              <FilterPill active={mine} onClick={() => setMineOnly((v) => !v)}>
                <User className="size-3" aria-hidden="true" />
                Your apps
                {mine && <X className="size-3" aria-hidden="true" />}
              </FilterPill>
            )}
            {APP_PLATFORMS.map((p) => {
              const isActive = p === platform;
              return (
                <FilterPill
                  key={p}
                  active={isActive}
                  onClick={() => setPlatform(isActive ? undefined : p)}
                >
                  {PLATFORM_LABELS[p]}
                  {isActive && <X className="size-3" aria-hidden="true" />}
                </FilterPill>
              );
            })}
          </div>

          {!isLoading && (
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm text-muted-foreground" role="status">
                {filtered.length} {filtered.length === 1 ? 'app' : 'apps'}
                {searching && !mine && <> matching "{query}" via the search relays</>}
              </p>
              {hiddenRows.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowHidden((v) => !v)}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    showHidden
                      ? 'bg-muted-foreground/20 text-foreground'
                      : 'bg-muted/50 text-muted-foreground hover:bg-muted',
                  )}
                >
                  <Eye className="size-3" aria-hidden="true" />
                  {showHidden ? 'Hide incomplete' : `Show ${hiddenRows.length} hidden`}
                </button>
              )}
            </div>
          )}
        </>
      }
    >
      <DiscoveryGrid
        items={filtered}
        isLoading={isLoading}
        getKey={(row) => row.app.address}
        renderItem={(row) => <AppCard app={row.app} tier={row.overall?.tier ?? null} />}
        renderSkeleton={() => <AppCardSkeleton />}
        empty={
          mine && rows.length === 0
            ? "You haven't published any app listings on Nostr yet."
            : searching
              ? `No apps match “${query}”. Try a different search term or clear the filters.`
              : tierFilter !== 'all' || platform
                ? 'No apps match the current filters. Try clearing them.'
                : 'No apps found. Try checking your relay connections or wait a moment for content to load.'
        }
      />
    </DiscoveryPage>
  );
}

export default AppsPage;
