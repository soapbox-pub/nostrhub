import { Package } from 'lucide-react';
import type { ReleaseWithApp } from '@/hooks/useReleases';
import { releaseDisplayName } from '@/lib/zapstore';
import { useAuthor } from '@/hooks/useAuthor';
import { UserAvatar } from '@/components/UserAvatar';
import { shortNpub } from '@/lib/nostr';
import { noteExcerpt, shortAgo } from '@/lib/noteText';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

interface ReleaseCardProps {
  item: ReleaseWithApp;
}

const CHANNEL_LABELS: Record<string, string> = {
  beta: 'Beta',
  nightly: 'Nightly',
  dev: 'Dev',
};

/** Directory card for a Zapstore software release (kind 30063). */
export function ReleaseCard({ item }: ReleaseCardProps) {
  const { release, app } = item;
  const author = useAuthor(release.pubkey);
  const authorMeta = author.data?.metadata;
  const authorName = authorMeta?.name || authorMeta?.display_name || shortNpub(release.pubkey);

  const name = app?.name || releaseDisplayName(release);
  const icon = app?.icon;
  const summary = app?.summary;
  const notes = noteExcerpt(release.notes, 160);
  const channelLabel = CHANNEL_LABELS[release.channel];

  // Zapstore releases don't have an internal detail route — link out to the
  // app's Zapstore page when we know its identifier.
  const appId = app?.identifier ?? release.appIdentifier;
  const zapstoreUrl = appId
    ? `https://zapstore.dev/apps/${encodeURIComponent(appId)}`
    : undefined;

  return (
    <Card className="group relative h-full overflow-hidden border-border/70 bg-card/60 backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-[0_8px_40px_-8px] hover:shadow-primary/30">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-8 -top-10 size-32 rounded-full bg-primary/20 opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-100"
      />
      <a
        href={zapstoreUrl ?? 'https://zapstore.dev'}
        target="_blank"
        rel="noopener noreferrer"
        className="relative block h-full rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <CardContent className="flex h-full flex-col gap-3 px-4">
          <div className="flex items-start gap-3">
            <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl border border-border/60 bg-muted/40">
              {icon ? (
                <img src={icon} alt="" loading="lazy" className="size-full object-cover" />
              ) : (
                <Package className="size-5 text-muted-foreground" aria-hidden="true" />
              )}
            </span>
            <div className="min-w-0 flex-1 space-y-0.5">
              <h3 className="truncate font-semibold leading-snug tracking-tight group-hover:text-primary">
                {name}
              </h3>
              <div className="flex flex-wrap items-center gap-1.5">
                {release.version && (
                  <Badge variant="secondary" className="text-[10px] tracking-wider">
                    v{release.version}
                  </Badge>
                )}
                {channelLabel && (
                  <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                    {channelLabel}
                  </Badge>
                )}
                <span className="text-xs text-muted-foreground">{shortAgo(release.createdAt)}</span>
              </div>
            </div>
          </div>

          {(notes || summary) && (
            <p className="line-clamp-3 flex-1 text-sm text-muted-foreground">
              {notes || summary}
            </p>
          )}

          <div className="flex items-center gap-2 border-t border-border/50 pt-3">
            <UserAvatar pubkey={release.pubkey} size="sm" />
            <span className="truncate text-xs text-muted-foreground">by {authorName}</span>
          </div>
        </CardContent>
      </a>
    </Card>
  );
}

export function ReleaseCardSkeleton() {
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

export default ReleaseCard;
