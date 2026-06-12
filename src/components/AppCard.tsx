import { Link } from 'react-router-dom';
import { Blocks } from 'lucide-react';
import { clientTagsForApp } from '@/lib/apps';
import type { AppInfo } from '@/lib/apps';
import type { CompatTier } from '@/lib/appReviews';
import { TierBadge } from '@/components/TierBadge';
import { useAuthor } from '@/hooks/useAuthor';
import { useClientActiveUsers } from '@/hooks/useClientMetrics';
import { UserAvatar } from '@/components/UserAvatar';
import { shortNpub } from '@/lib/nostr';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

/** Compact integer formatting for headline-style counts (e.g. 1.2K, 3.4M). */
function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

interface AppCardProps {
  app: AppInfo;
  /**
   * Overall compatibility tier from aggregated kind 31986 reports.
   * Shown only when reports exist — omit or pass `null` to hide.
   */
  tier?: CompatTier | null;
}

/** Directory card for a NIP-89 app listing (kind 31990). */
export function AppCard({ app, tier }: AppCardProps) {
  const author = useAuthor(app.pubkey);
  const authorMeta = author.data?.metadata;
  const authorName = authorMeta?.name || authorMeta?.display_name || shortNpub(app.pubkey);

  const icon = sanitizeUrl(app.picture);
  const website = sanitizeUrl(app.website);

  // Monthly active users — distinct authors who posted with this app in the
  // last 30 days, the same headline shown on the app detail page. One COUNT
  // query per card (see useClientActiveUsers).
  const { data: activeUsers } = useClientActiveUsers(
    clientTagsForApp({ name: app.name, website }),
  );

  return (
    <Card className="group relative h-full overflow-hidden border-border/70 bg-card/60 backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-[0_8px_40px_-8px] hover:shadow-primary/30">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-8 -top-10 size-32 rounded-full bg-primary/20 opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-100"
      />
      <Link
        to={`/${app.naddr}`}
        className="relative block h-full rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <CardContent className="flex h-full flex-col gap-3 px-4">
          <div className="flex items-start gap-3">
            <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl border border-border/60 bg-muted/40">
              {icon ? (
                <img src={icon} alt="" loading="lazy" className="size-full object-cover" />
              ) : (
                <Blocks className="size-5 text-muted-foreground" aria-hidden="true" />
              )}
            </span>
            <div className="min-w-0 flex-1 space-y-0.5">
              <h3 className="truncate font-semibold leading-snug tracking-tight group-hover:text-primary">
                {app.name}
              </h3>
              {website && (
                <p className="truncate text-xs text-muted-foreground">
                  {website.replace(/^https:\/\//, '').replace(/\/$/, '')}
                </p>
              )}
            </div>
            {tier != null && (
              <TierBadge tier={tier} size="sm" className="shrink-0" />
            )}
          </div>

          {app.about && (
            <p className="line-clamp-3 flex-1 text-sm text-muted-foreground">{app.about}</p>
          )}

          <div className="flex flex-wrap items-center gap-1.5">
            {app.platforms.map((platform) => (
              <Badge key={platform} variant="secondary" className="text-[10px] uppercase tracking-wider">
                {platform}
              </Badge>
            ))}
          </div>

          <div className="flex items-center gap-2 border-t border-border/50 pt-3">
            <UserAvatar pubkey={app.pubkey} size="sm" />
            <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">by {authorName}</span>
            {activeUsers != null && activeUsers > 0 && (
              <span
                className="shrink-0 text-base font-bold tracking-tight"
                title={`${activeUsers.toLocaleString()} active users in the last 30 days`}
              >
                {formatCount(activeUsers)}{' '}
                <span className="text-xs font-medium text-muted-foreground">Active Users</span>
              </span>
            )}
          </div>
        </CardContent>
      </Link>
    </Card>
  );
}

export function AppCardSkeleton() {
  return (
    <Card>
      <CardContent className="space-y-3 px-4">
        <div className="flex items-start gap-3">
          <Skeleton className="size-12 rounded-xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <div className="flex items-center gap-2 pt-1">
          <Skeleton className="size-6 rounded-full" />
          <Skeleton className="h-3 w-24" />
        </div>
      </CardContent>
    </Card>
  );
}

export default AppCard;
