import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { nip19 } from 'nostr-tools';
import { AlertCircle, Blocks, ChevronDown, ExternalLink, Pencil } from 'lucide-react';
import { Layout } from '@/components/Layout';
import { BackLink, DetailHero } from '@/components/DetailHero';
import { DetailSurface } from '@/components/DetailSurface';
import { CommentsSection } from '@/components/comments/CommentsSection';
import { UserAvatar } from '@/components/UserAvatar';
import { ExpertToggleButton } from '@/components/ExpertToggleButton';
import { TierBadge } from '@/components/TierBadge';
import { TagBadge } from '@/components/TagBadge';
import { AppReviewForm } from '@/components/AppReviewForm';
import { AppReviewCard } from '@/components/AppReviewCard';
import { ClientMetrics } from '@/components/ClientMetrics';
import { AppSidebar, AppLinksNudge } from '@/components/AppSidebar';
import { useApp } from '@/hooks/useApps';
import { useAppReviews } from '@/hooks/useAppReviews';
import { useAuthor } from '@/hooks/useAuthor';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { shortNpub } from '@/lib/nostr';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import {
  TIERS,
  TRACKED_NIPS,
  aggregateReviews,
  type TierAggregate,
} from '@/lib/appReviews';
import { clientTagsForApp, hasSidebarContent } from '@/lib/apps';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
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
  const { user } = useCurrentUser();
  const isOwner = user?.pubkey === pubkey;
  const authorMeta = author.data?.metadata;
  const authorName = authorMeta?.name || authorMeta?.display_name || shortNpub(pubkey);
  const [nipOpen, setNipOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  useSeoMeta({
    title: app ? `${app.name} | NostrHub` : 'App | NostrHub',
    description: app?.about ? app.about.slice(0, 160) : 'A Nostr app listed on NostrHub.',
  });

  const { perNip, overall } = useMemo(
    () => aggregateReviews(reviews.data ?? []),
    [reviews.data],
  );

  const icon = sanitizeUrl(app?.picture);
  const website = sanitizeUrl(app?.website);

  // `#client` tag values to count usage by: the app name, its lowercase form,
  // and the website hostname (sans `www.`). Built from the sanitized website
  // so it stays consistent with the directory cards.
  const clientTags = app ? clientTagsForApp({ name: app.name, website }) : [];

  return (
    <Layout className={app && hasSidebarContent(app) ? 'max-w-6xl' : 'max-w-3xl'}>
      <BackLink to="/apps">Back to Apps</BackLink>

      {isLoading ? (
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <Skeleton className="size-14 rounded-2xl sm:size-16" />
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
          {/* Header: shared detail-page hero — brand tile, title, tier, actions */}
          <DetailSurface>
          <DetailHero
            className="border-b-0 pb-0"
            icon={<Blocks className="size-7 text-primary" aria-hidden="true" />}
            image={icon}
            title={app.name}
            titleAside={overall?.tier ? <TierBadge tier={overall.tier} size="lg" /> : undefined}
            subtitle={
              overall ? (
                <>
                  Based on {overall.count} compatibility report{overall.count !== 1 ? 's' : ''}{' '}
                  across {perNip.size} NIP{perNip.size !== 1 ? 's' : ''}.
                </>
              ) : (
                app.nip05 ?? undefined
              )
            }
            primaryAction={
              website ? (
                <Button asChild className="gap-1.5">
                  <a href={website} target="_blank" rel="noopener noreferrer">
                    Open app
                    <ExternalLink className="size-4" aria-hidden="true" />
                  </a>
                </Button>
              ) : undefined
            }
            actions={
              isOwner ? (
                <Button asChild variant="outline" size="sm" className="gap-1.5">
                  <Link to={`/apps/edit/${app.naddr}`}>
                    <Pencil className="size-4" aria-hidden="true" />
                    Edit
                  </Link>
                </Button>
              ) : undefined
            }
          >
            {/* Usage metrics: active users + 30-day series, between the title
                row and the action row, keyed on the app name / hostname as `#client`. */}
            {clientTags.length > 0 && <ClientMetrics clientTags={clientTags} />}
          </DetailHero>
          </DetailSurface>

          {/* Description and details on the left, resource cards on the right —
              the sidebar starts at description level, below the name row. */}
          <div
            className={cn(
              'space-y-6',
              (hasSidebarContent(app) || isOwner) &&
                'lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-8 lg:space-y-0',
            )}
          >
            <DetailSurface className="min-w-0 space-y-6">
              <div className="space-y-3">
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
                      <TagBadge key={tag} tag={tag} to="apps" />
                    ))}
                  </div>
                )}
              </div>

              {/* NIP compatibility breakdown */}
              <section className="border-t border-border/60 pt-6">
                <Collapsible open={nipOpen} onOpenChange={setNipOpen}>
                  <CollapsibleTrigger asChild>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-expanded={nipOpen}
                    >
                      <div className="space-y-1">
                        <h2 className="text-xl font-semibold tracking-tight">NIP Compatibility</h2>
                        <p className="text-sm text-muted-foreground">
                          Community-reported compatibility per NIP. The median of all reports decides each
                          tier, ProtonDB-style.
                        </p>
                      </div>
                      <ChevronDown
                        className={cn('size-5 shrink-0 text-muted-foreground transition-transform duration-200', nipOpen && 'rotate-180')}
                        aria-hidden="true"
                      />
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-3">
                    {reviews.isLoading ? (
                      <Skeleton className="h-64 w-full rounded-xl" />
                    ) : (
                      <NipBreakdown perNip={perNip} />
                    )}
                  </CollapsibleContent>
                </Collapsible>
              </section>

              {/* Submit reports */}
              <section className="border-t border-border/60 pt-6">
                <Collapsible open={reportOpen} onOpenChange={setReportOpen}>
                  <CollapsibleTrigger asChild>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-expanded={reportOpen}
                    >
                      <div className="space-y-1">
                        <h2 className="text-xl font-semibold tracking-tight">Submit a Report</h2>
                        <p className="text-sm text-muted-foreground">
                          Rate how well this app implements each NIP.
                        </p>
                      </div>
                      <ChevronDown
                        className={cn('size-5 shrink-0 text-muted-foreground transition-transform duration-200', reportOpen && 'rotate-180')}
                        aria-hidden="true"
                      />
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-3">
                    <AppReviewForm app={app} />
                  </CollapsibleContent>
                </Collapsible>
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

              {/* Discussion */}
              <section className="space-y-4 border-t border-border/60 pt-6">
                <h2 className="text-xl font-semibold tracking-tight">Discussion</h2>
                <CommentsSection
                  root={app.event}
                  emptyStateMessage="No discussion yet"
                  emptyStateSubtitle="Share your experience with this app."
                />
              </section>
            </DetailSurface>

            {(hasSidebarContent(app) || isOwner) && (
              <aside aria-label="App resources" className="space-y-4 lg:sticky lg:top-24">
                {isOwner && <AppLinksNudge app={app} />}
                <AppSidebar app={app} />
              </aside>
            )}
          </div>
        </article>
      )}
    </Layout>
  );
}

export default AppPage;
