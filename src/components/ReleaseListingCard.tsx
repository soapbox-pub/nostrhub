import { Package } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { ReleaseListing } from '@/hooks/useZapstoreSearch';
import { useAuthor } from '@/hooks/useAuthor';
import { UserAvatar } from '@/components/UserAvatar';
import { shortNpub } from '@/lib/nostr';
import { noteExcerpt, shortAgo } from '@/lib/noteText';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

const CHANNEL_LABELS: Record<string, string> = {
  beta: 'Beta',
  nightly: 'Nightly',
  dev: 'Dev',
};

/**
 * Directory card for a Zapstore app listing (kind 32267) paired with its
 * latest release, used on the releases-by-tag browse grid. Always links to the
 * in-app app page.
 */
export function ReleaseListingCard({ listing }: { listing: ReleaseListing }) {
  const { app, release } = listing;
  const author = useAuthor(app.pubkey);
  const authorMeta = author.data?.metadata;
  const authorName = authorMeta?.name || authorMeta?.display_name || shortNpub(app.pubkey);

  const version = release?.version ?? app.version;
  const channelLabel = release ? CHANNEL_LABELS[release.channel] : undefined;
  const blurb = release?.notes
    ? noteExcerpt(release.notes, 160)
    : app.summary ?? noteExcerpt(app.description ?? '', 160);
  const timestamp = release?.createdAt ?? app.createdAt;

  return (
    <Card className="group relative h-full overflow-clip border-border/70 bg-card/60 backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-[0_8px_40px_-8px] hover:shadow-primary/30">
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
              {app.icon ? (
                <img src={app.icon} alt="" loading="lazy" className="size-full object-cover" />
              ) : (
                <Package className="size-5 text-muted-foreground" aria-hidden="true" />
              )}
            </span>
            <div className="min-w-0 flex-1 space-y-0.5">
              <h3 className="truncate font-semibold leading-snug tracking-tight group-hover:text-primary">
                {app.name}
              </h3>
              <div className="flex flex-wrap items-center gap-1.5">
                {version && (
                  <Badge variant="secondary" className="text-[10px] tracking-wider">
                    v{version}
                  </Badge>
                )}
                {channelLabel && (
                  <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                    {channelLabel}
                  </Badge>
                )}
                <span className="text-xs text-muted-foreground">{shortAgo(timestamp)}</span>
              </div>
            </div>
          </div>

          {blurb && (
            <p className="line-clamp-3 flex-1 text-sm text-muted-foreground">{blurb}</p>
          )}

          <div className="flex items-center gap-2 border-t border-border/50 pt-3">
            <UserAvatar pubkey={app.pubkey} size="sm" />
            <span className="truncate text-xs text-muted-foreground">by {authorName}</span>
          </div>
        </CardContent>
      </Link>
    </Card>
  );
}

export function ReleaseListingCardSkeleton() {
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

export default ReleaseListingCard;
