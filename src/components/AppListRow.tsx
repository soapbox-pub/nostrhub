import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Blocks, ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';
import type { AppInfo } from '@/lib/apps';
import { TIERS, TRACKED_NIPS, type TierAggregate } from '@/lib/appReviews';
import { TierBadge } from '@/components/TierBadge';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export interface AppRow {
  app: AppInfo;
  overall: TierAggregate | null;
  perNip: Map<string, TierAggregate>;
}

/**
 * ProtonDB-style directory row for an app: a tier-colored accent bar, the
 * overall compatibility badge, and an expandable per-NIP tier breakdown
 * aggregated from kind 31986 reports.
 */
export function AppListRow({ row }: { row: AppRow }) {
  const { app, overall, perNip } = row;
  const [expanded, setExpanded] = useState(false);

  const icon = sanitizeUrl(app.picture);
  const accentColor = overall ? TIERS[overall.tier].color : 'hsl(var(--border))';

  return (
    <div className="overflow-hidden rounded-xl border border-border/70 bg-card/60 backdrop-blur-sm transition-colors hover:border-primary/40">
      {/* Main row */}
      <div className="flex items-center">
        {/* Tier color bar */}
        <div className="w-1 shrink-0 self-stretch" style={{ backgroundColor: accentColor }} />

        {/* App icon */}
        <span className="my-2.5 ml-3 grid size-12 shrink-0 place-items-center overflow-hidden rounded-lg border border-border/60 bg-muted/40 sm:size-14">
          {icon ? (
            <img src={icon} alt="" loading="lazy" className="size-full object-cover" />
          ) : (
            <Blocks className="size-5 text-muted-foreground" aria-hidden="true" />
          )}
        </span>

        {/* Name + description */}
        <div className="min-w-0 flex-1 px-3 py-2.5">
          <div className="flex items-center gap-2">
            <Link
              to={`/${app.naddr}`}
              className="truncate text-sm font-semibold tracking-tight transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-base"
            >
              {app.name}
            </Link>
            {app.platforms.length > 0 && (
              <span className="hidden text-[10px] uppercase tracking-wider text-muted-foreground sm:inline">
                {app.platforms.join(' / ')}
              </span>
            )}
          </div>
          {app.about && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{app.about}</p>
          )}
        </div>

        {/* Overall tier badge */}
        <div className="shrink-0 px-2 sm:px-3">
          <TierBadge tier={overall?.tier ?? null} size="md" />
        </div>

        {/* Expand toggle */}
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
          aria-label={expanded ? 'Collapse NIP details' : 'Expand NIP details'}
          className="shrink-0 border-l border-border/40 p-2.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-3"
        >
          {expanded ? (
            <ChevronDown className="size-4" aria-hidden="true" />
          ) : (
            <ChevronRight className="size-4" aria-hidden="true" />
          )}
        </button>
      </div>

      {/* Expanded per-NIP breakdown */}
      {expanded && (
        <div className="border-t border-border/40">
          {TRACKED_NIPS.map((nip, i) => {
            const nipData = perNip.get(nip.id);
            const tierInfo = nipData ? TIERS[nipData.tier] : null;

            return (
              <div
                key={nip.id}
                className={cn(
                  'flex items-center gap-3 px-4 py-1.5 text-xs',
                  i % 2 === 0 ? 'bg-transparent' : 'bg-muted/20',
                )}
              >
                <span
                  aria-hidden="true"
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: tierInfo ? tierInfo.color : 'hsl(var(--muted))' }}
                />
                <span className="w-8 shrink-0 font-mono text-muted-foreground">
                  {nip.id.replace('nip-', '').toUpperCase()}
                </span>
                <span
                  className="flex-1 truncate"
                  style={{ color: tierInfo ? tierInfo.color : 'hsl(var(--muted-foreground))' }}
                >
                  {nip.name}
                </span>
                {tierInfo ? (
                  <span
                    className="shrink-0 text-[10px] font-semibold uppercase tracking-wider"
                    style={{ color: tierInfo.color }}
                  >
                    {tierInfo.label}
                  </span>
                ) : (
                  <span className="shrink-0 text-muted-foreground/40">--</span>
                )}
                <span className="w-6 shrink-0 text-right font-mono text-muted-foreground/50">
                  {nipData?.count ?? 0}
                </span>
              </div>
            );
          })}

          <div className="border-t border-border/40 px-4 py-2">
            <Link
              to={`/${app.naddr}`}
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-primary"
            >
              View full report &amp; submit review
              <ExternalLink className="size-3" aria-hidden="true" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

export function AppListRowSkeleton() {
  return <Skeleton className="h-20 w-full rounded-xl" />;
}

export default AppListRow;
