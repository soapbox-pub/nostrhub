import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { nip19 } from 'nostr-tools';
import { AlertCircle, ArrowLeft, Blocks, ExternalLink } from 'lucide-react';
import { Layout } from '@/components/Layout';
import { CommentsSection } from '@/components/comments/CommentsSection';
import { UserAvatar } from '@/components/UserAvatar';
import { ExpertToggleButton } from '@/components/ExpertToggleButton';
import { TierBadge } from '@/components/TierBadge';
import { AppReviewForm } from '@/components/AppReviewForm';
import { AppReviewCard } from '@/components/AppReviewCard';
import { useApp } from '@/hooks/useApps';
import { useAppReviews } from '@/hooks/useAppReviews';
import { useAuthor } from '@/hooks/useAuthor';
import { shortNpub } from '@/lib/nostr';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import {
  TIERS,
  TRACKED_NIPS,
  aggregateReviews,
  type TierAggregate,
} from '@/lib/appReviews';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface AppPageProps {
  /** Hex pubkey of the app publisher (from the naddr). */
  pubkey: string;
  /** The `d` tag identifier (from the naddr). */
  identifier: string;
}

/** ProtonDB-style per-NIP compatibility breakdown table. */
function NipBreakdown({ perNip }: { perNip: Map<string, TierAggregate> }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border/60">
      {TRACKED_NIPS.map((nip, i) => {
        const nipData = perNip.get(nip.id);
        const tierInfo = nipData ? TIERS[nipData.tier] : null;

        return (
          <div
            key={nip.id}
            className={cn(
              'flex items-center gap-3 px-4 py-2 text-sm',
              i % 2 === 0 ? 'bg-transparent' : 'bg-muted/20',
            )}
          >
            <span
              aria-hidden="true"
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: tierInfo ? tierInfo.color : 'hsl(var(--muted))' }}
            />
            <span className="w-9 shrink-0 font-mono text-xs text-muted-foreground">
              {nip.id.replace('nip-', '').toUpperCase()}
            </span>
            <span className="min-w-0 flex-1 truncate">
              {nip.name}
              <span className="ml-2 hidden text-xs text-muted-foreground sm:inline">
                {nip.description}
              </span>
            </span>
            {tierInfo ? (
              <span
                className="shrink-0 text-[10px] font-semibold uppercase tracking-wider"
                style={{ color: tierInfo.color }}
              >
                {tierInfo.label}
              </span>
            ) : (
              <span className="shrink-0 text-xs text-muted-foreground/40">--</span>
            )}
            <span className="w-6 shrink-0 text-right font-mono text-xs text-muted-foreground/50">
              {nipData?.count ?? 0}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Detail view for a NIP-89 app listing (kind 31990), routed via its naddr. */
export function AppPage({ pubkey, identifier }: AppPageProps) {
  const { data: app, isLoading, isError } = useApp(pubkey, identifier);
  const reviews = useAppReviews(app?.address);
  const author = useAuthor(pubkey);
  const authorMeta = author.data?.metadata;
  const authorName = authorMeta?.name || authorMeta?.display_name || shortNpub(pubkey);

  useSeoMeta({
    title: app ? `${app.name} | NostrHub` : 'App | NostrHub',
    description: app?.about ? app.about.slice(0, 160) : 'A Nostr app listed on NostrHub.',
  });

  const { perNip, overall } = useMemo(
    () => aggregateReviews(reviews.data ?? []),
    [reviews.data],
  );

  const banner = sanitizeUrl(app?.banner);
  const icon = sanitizeUrl(app?.picture);
  const website = sanitizeUrl(app?.website);

  return (
    <Layout className="max-w-5xl">
      <Button variant="ghost" asChild className="-ml-2 mb-4">
        <Link to="/apps">
          <ArrowLeft className="mr-1.5 size-4" /> Back to Apps
        </Link>
      </Button>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-40 w-full rounded-2xl sm:h-52" />
          <div className="flex items-center gap-4">
            <Skeleton className="size-20 rounded-2xl" />
            <div className="space-y-2">
              <Skeleton className="h-8 w-56" />
              <Skeleton className="h-4 w-40" />
            </div>
          </div>
          <Skeleton className="h-24 w-full" />
        </div>
      ) : isError || !app ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertDescription>
            Could not load this app. It may not exist on your relays.
          </AlertDescription>
        </Alert>
      ) : (
        <article className="space-y-6">
          {/* Banner */}
          <div
            className="relative isolate h-40 overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-primary/20 via-nebula/15 to-background sm:h-52"
            aria-hidden={banner ? undefined : 'true'}
          >
            {banner && (
              <img src={banner} alt="" className="absolute inset-0 size-full object-cover" loading="lazy" />
            )}
            <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-background/60 to-transparent" />
          </div>

          {/* Header */}
          <header className="space-y-4 px-1 sm:px-2">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <span className="-mt-14 grid size-20 shrink-0 place-items-center overflow-hidden rounded-2xl border-4 border-background bg-muted/40 shadow-lg sm:-mt-16 sm:size-24">
                {icon ? (
                  <img src={icon} alt="" className="size-full object-cover" />
                ) : (
                  <Blocks className="size-8 text-muted-foreground" aria-hidden="true" />
                )}
              </span>
              {website && (
                <Button asChild className="gap-1.5 rounded-full">
                  <a href={website} target="_blank" rel="noopener noreferrer">
                    Open app
                    <ExternalLink className="size-4" aria-hidden="true" />
                  </a>
                </Button>
              )}
            </div>

            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="font-display text-3xl font-bold tracking-tight">{app.name}</h1>
                <TierBadge tier={overall?.tier ?? null} size="lg" />
              </div>
              {overall && (
                <p className="text-sm text-muted-foreground">
                  Based on {overall.count} compatibility report{overall.count !== 1 ? 's' : ''}{' '}
                  across {perNip.size} NIP{perNip.size !== 1 ? 's' : ''}.
                </p>
              )}
              {app.nip05 && <p className="text-muted-foreground">{app.nip05}</p>}
            </div>

            {app.about && (
              <p className="max-w-prose whitespace-pre-wrap break-words leading-relaxed text-foreground/90">
                {app.about}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <Link
                to={`/${nip19.npubEncode(app.pubkey)}`}
                className="flex items-center gap-2 hover:text-primary"
              >
                <UserAvatar pubkey={app.pubkey} size="sm" />
                <span className="text-sm font-medium">by {authorName}</span>
              </Link>
              <ExpertToggleButton pubkey={app.pubkey} iconOnly />
            </div>

            {(app.platforms.length > 0 || app.hashtags.length > 0) && (
              <div className="flex flex-wrap items-center gap-1.5">
                {app.platforms.map((platform) => (
                  <Badge key={platform} variant="secondary" className="text-[10px] uppercase tracking-wider">
                    {platform}
                  </Badge>
                ))}
                {app.hashtags.map((tag) => (
                  <Badge key={tag} variant="outline" className="text-xs text-muted-foreground">
                    #{tag}
                  </Badge>
                ))}
              </div>
            )}
          </header>

          {/* NIP compatibility breakdown */}
          <section className="space-y-3 border-t border-border/60 pt-6">
            <h2 className="text-xl font-semibold tracking-tight">NIP Compatibility</h2>
            <p className="text-sm text-muted-foreground">
              Community-reported compatibility per NIP — the median of all reports decides each
              tier, ProtonDB-style.
            </p>
            {reviews.isLoading ? (
              <Skeleton className="h-64 w-full rounded-xl" />
            ) : (
              <NipBreakdown perNip={perNip} />
            )}
          </section>

          {/* Submit reports */}
          <section className="space-y-3 border-t border-border/60 pt-6">
            <AppReviewForm app={app} />
          </section>

          {/* Recent reports */}
          {(reviews.data?.length ?? 0) > 0 && (
            <section className="space-y-4 border-t border-border/60 pt-6">
              <h2 className="text-xl font-semibold tracking-tight">
                Reports
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  {reviews.data!.length}
                </span>
              </h2>
              <div className="space-y-3">
                {reviews.data!.slice(0, 30).map((review) => (
                  <AppReviewCard key={review.event.id} review={review} />
                ))}
              </div>
            </section>
          )}

          {/* Supported kinds */}
          {app.supportedKinds.length > 0 && (
            <section className="space-y-3 border-t border-border/60 pt-6">
              <h2 className="text-xl font-semibold tracking-tight">Handled kinds</h2>
              <p className="text-sm text-muted-foreground">
                Event kinds this app announces it can display or handle (NIP-89).
              </p>
              <div className="flex flex-wrap gap-1.5">
                {app.supportedKinds.map((kind) => (
                  <Badge key={kind} variant="outline" className="font-mono text-xs">
                    kind {kind}
                  </Badge>
                ))}
              </div>
            </section>
          )}

          {/* Discussion */}
          <section className="space-y-4 border-t border-border/60 pt-6">
            <h2 className="text-xl font-semibold tracking-tight">Discussion</h2>
            <CommentsSection
              root={app.event}
              emptyStateMessage="No discussion yet"
              emptyStateSubtitle="Share your experience with this app."
            />
          </section>
        </article>
      )}
    </Layout>
  );
}

export default AppPage;
