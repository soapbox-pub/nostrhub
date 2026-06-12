import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { Eye, HelpCircle, PlusCircle, Search, X } from 'lucide-react';
import { Layout } from '@/components/Layout';
import { AppListRow, AppListRowSkeleton, type AppRow } from '@/components/AppListRow';
import { TIER_ICONS } from '@/lib/tierIcons';
import { useAppSearch } from '@/hooks/useAppSearch';
import { useAllAppReviews } from '@/hooks/useAppReviews';
import { APP_PLATFORMS, hasFullAppMetadata, type AppPlatform } from '@/lib/apps';
import {
  TIERS,
  TIER_ORDER,
  aggregateReviews,
  type CompatTier,
  type ReviewReport,
} from '@/lib/appReviews';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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
  const [search, setSearch] = useState('');
  const [platform, setPlatform] = useState<AppPlatform>();
  const [tierFilter, setTierFilter] = useState<TierFilter>('all');
  const [sortBy, setSortBy] = useState<SortBy>('hot');
  const [showHidden, setShowHidden] = useState(false);

  const query = useDebounced(search).trim();
  const searching = query.length > 0;

  const browse = useAppSearch('sort:hot');
  const results = useAppSearch(searching ? `${query} sort:hot` : '');
  const reviews = useAllAppReviews();

  useSeoMeta({
    title: 'Apps | NostrHub',
    description:
      'Discover Nostr applications announced on the network via NIP-89 — search the directory and see how well each app implements the NIPs, ProtonDB-style.',
  });

  const active = searching ? results : browse;

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
    const visible: AppRow[] = [];
    const hidden: AppRow[] = [];
    for (const row of rows) {
      if (hasFullAppMetadata(row.app)) visible.push(row);
      else hidden.push(row);
    }
    return { visibleRows: visible, hiddenRows: hidden };
  }, [rows]);

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
  }, [visibleRows, hiddenRows, platform, tierFilter, sortBy, searching, showHidden]);

  const isLoading = active.isLoading || reviews.isLoading || (searching && search.trim() !== query);

  return (
    <Layout>
      <div className="space-y-8">
        <header className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
              <span className="text-cosmic">Apps</span>
            </h1>
            <Button asChild variant="outline" className="gap-1.5">
              <Link to="/apps/submit">
                <PlusCircle className="size-4" aria-hidden="true" />
                Add an app
              </Link>
            </Button>
          </div>
          <p className="max-w-prose text-lg text-muted-foreground">
            Applications announced on Nostr itself. Every listing is a NIP-89 handler event, and
            the community rates how well each one implements the NIPs, ProtonDB-style.
          </p>
        </header>

        <div className="space-y-3">
          {/* Search + sort */}
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1 sm:max-w-md">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search apps…"
                aria-label="Search apps"
                className="pl-9"
              />
            </div>
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

          {/* Tier filter pills */}
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

          {/* Platform filter pills */}
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by platform">
            {APP_PLATFORMS.map((p) => {
              const isActive = p === platform;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPlatform(isActive ? undefined : p)}
                  aria-pressed={isActive}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    isActive
                      ? 'border-primary/40 bg-gradient-to-r from-primary/15 to-nebula/15 text-foreground'
                      : 'border-border/60 text-muted-foreground hover:border-primary/30 hover:text-foreground',
                  )}
                >
                  {PLATFORM_LABELS[p]}
                  {isActive && <X className="size-3" aria-hidden="true" />}
                </button>
              );
            })}
          </div>

          {!isLoading && (
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm text-muted-foreground" role="status">
                {filtered.length} {filtered.length === 1 ? 'app' : 'apps'}
                {searching && <> matching "{query}" via the search relays</>}
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
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <AppListRowSkeleton key={i} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="px-8 py-12 text-center">
              <p className="mx-auto max-w-sm text-muted-foreground">
                {searching
                  ? `No apps match “${query}”. Try a different search term or clear the filters.`
                  : tierFilter !== 'all' || platform
                    ? 'No apps match the current filters. Try clearing them.'
                    : 'No apps found. Try checking your relay connections or wait a moment for content to load.'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {filtered.map((row) => (
              <AppListRow key={row.app.address} row={row} />
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}

export default AppsPage;
