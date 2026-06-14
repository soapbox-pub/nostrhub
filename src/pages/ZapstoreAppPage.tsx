import { useSeoMeta } from '@unhead/react';
import { Link } from 'react-router-dom';
import { nip19 } from 'nostr-tools';
import {
  AlertCircle,
  ExternalLink,
  Package,
  ShoppingBag,
} from 'lucide-react';
import { Layout } from '@/components/Layout';
import { BackLink, DetailHero } from '@/components/DetailHero';
import { DetailSurface } from '@/components/DetailSurface';
import { MarkdownContent } from '@/components/MarkdownContent';
import { CommentsSection } from '@/components/comments/CommentsSection';
import { UserAvatar } from '@/components/UserAvatar';
import { TagBadge } from '@/components/TagBadge';
import { AppSidebar, AppLinksNudge, CreateAppListingNudge } from '@/components/AppSidebar';
import { SidebarCardTitle } from '@/components/CrossRefCards';
import { useAuthor } from '@/hooks/useAuthor';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAppForZapstore } from '@/hooks/useApps';
import { hasSidebarContent } from '@/lib/apps';
import {
  useZapstoreApp,
  useZapstoreReleases,
  useZapstoreAssets,
  zapstoreAppUrl,
} from '@/hooks/useZapstoreSearch';
import type { ZapstoreRelease } from '@/lib/zapstore';
import { primaryAsset } from '@/lib/zapstore';
import { AssetDownloadButton } from '@/components/AssetDownloadButton';
import { shortNpub } from '@/lib/nostr';
import { shortAgo } from '@/lib/noteText';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';

interface ZapstoreAppPageProps {
  /** Hex pubkey of the app publisher (from the naddr). */
  pubkey: string;
  /** The `d` tag identifier — the package id (from the naddr). */
  identifier: string;
}

const CHANNEL_LABELS: Record<string, string> = {
  beta: 'Beta',
  nightly: 'Nightly',
  dev: 'Dev',
};

/** A single row in the release history list — links to the in-app release page. */
function ReleaseHistoryRow({ release }: { release: ZapstoreRelease }) {
  const channelLabel = CHANNEL_LABELS[release.channel];
  return (
    <Link
      to={`/${release.naddr}`}
      className="group flex items-center gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5 transition-colors hover:border-primary/40 hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
        <Package className="size-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-medium leading-snug">
            {release.version ? `v${release.version}` : 'Release'}
          </span>
          {channelLabel && (
            <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
              {channelLabel}
            </Badge>
          )}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {shortAgo(release.createdAt)} ago
        </span>
      </span>
    </Link>
  );
}

/** Detail view for a Zapstore app listing (kind 32267), routed via its naddr. */
export function ZapstoreAppPage({ pubkey, identifier }: ZapstoreAppPageProps) {
  const { data: app, isLoading, isError } = useZapstoreApp(pubkey, identifier);
  const releases = useZapstoreReleases(pubkey, identifier);
  const author = useAuthor(pubkey);
  const { user } = useCurrentUser();
  const isOwner = user?.pubkey === pubkey;
  const authorMeta = author.data?.metadata;
  const authorName = authorMeta?.name || authorMeta?.display_name || shortNpub(pubkey);

  // The NIP-89 listing (kind 31990) that references this Zapstore app is the
  // nexus carrying its repos, NIPs, and handled kinds — surface the same
  // sidebar the app page shows.
  const linkedAppQuery = useAppForZapstore(pubkey, identifier);
  const linkedApp = linkedAppQuery.data ?? undefined;

  const latestRelease = releases.data?.[0];
  const olderReleases = (releases.data ?? []).slice(1);

  // Downloadable assets for the newest release — powers the hero download CTA.
  const assets = useZapstoreAssets(pubkey, latestRelease?.assetIds ?? []);
  const primary = primaryAsset(assets.data ?? []);

  useSeoMeta({
    title: app ? `${app.name} | NostrHub` : 'App | NostrHub',
    description: app?.summary || app?.description?.slice(0, 160) || 'A software release on Zapstore.',
  });

  const externalUrl = zapstoreAppUrl(identifier);
  const hasLinkedSidebar = Boolean(linkedApp && hasSidebarContent(linkedApp));
  // Owner nudge: edit the existing listing's links, or create one when none
  // exists yet. Wait for the listing lookup to settle before deciding.
  const showOwnerNudge = isOwner && !linkedAppQuery.isLoading;
  const hasSidebar = Boolean(
    app && (app.website || (releases.data?.length ?? 0) > 0 || hasLinkedSidebar || showOwnerNudge),
  );

  return (
    <Layout className={hasSidebar ? 'max-w-6xl' : 'max-w-3xl'}>
      <BackLink to="/">Back</BackLink>

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
          <AlertDescription className="flex flex-wrap items-center gap-2">
            Could not load this app from your relays.
            <a
              href={externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-medium underline underline-offset-2"
            >
              View on Zapstore
              <ExternalLink className="size-3.5" aria-hidden="true" />
            </a>
          </AlertDescription>
        </Alert>
      ) : (
        <article className="space-y-6">
          <DetailSurface>
            <DetailHero
              className="border-b-0 pb-0"
              icon={<ShoppingBag className="size-7 text-primary" aria-hidden="true" />}
              image={app.icon}
              title={app.name}
              subtitle={app.identifier}
              badges={
                (app.version || latestRelease?.version || (app.platforms?.length ?? 0) > 0) ? (
                  <>
                    {(app.version || latestRelease?.version) && (
                      <Badge variant="secondary" className="text-[10px] tracking-wider">
                        v{app.version || latestRelease?.version}
                      </Badge>
                    )}
                    {app.platforms?.map((platform) => (
                      <Badge
                        key={platform}
                        variant="outline"
                        className="text-[10px] uppercase tracking-wider"
                      >
                        {platform}
                      </Badge>
                    ))}
                  </>
                ) : undefined
              }
              description={app.summary}
              primaryAction={
                <div className="flex flex-wrap items-center gap-2">
                  {primary ? (
                    <AssetDownloadButton asset={primary} />
                  ) : (
                    <Button asChild className="gap-1.5">
                      <a href={externalUrl} target="_blank" rel="noopener noreferrer">
                        Get on Zapstore
                        <ExternalLink className="size-4" aria-hidden="true" />
                      </a>
                    </Button>
                  )}
                  {primary && (
                    <Button asChild variant="outline" className="gap-1.5">
                      <a href={externalUrl} target="_blank" rel="noopener noreferrer">
                        View on Zapstore
                        <ExternalLink className="size-4" aria-hidden="true" />
                      </a>
                    </Button>
                  )}
                </div>
              }
            />
          </DetailSurface>

          <div
            className={
              hasSidebar
                ? 'space-y-6 lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-8 lg:space-y-0'
                : 'space-y-6'
            }
          >
            <DetailSurface className="min-w-0 space-y-6">
              {/* Author */}
              <div className="flex flex-wrap items-center gap-3">
                <Link
                  to={`/${nip19.npubEncode(pubkey)}`}
                  className="flex items-center gap-2 hover:text-primary"
                >
                  <UserAvatar pubkey={pubkey} size="sm" />
                  <span className="text-sm font-medium">by {authorName}</span>
                </Link>
              </div>

              {/* Categories — clickable, browse releases by tag */}
              {(app.categories?.length ?? 0) > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  {app.categories.map((category) => (
                    <TagBadge key={category} tag={category} to="releases" />
                  ))}
                </div>
              )}

              {/* Screenshots / preview images from the listing */}
              {(app.screenshots?.length ?? 0) > 0 && (
                <ScrollArea className="-mx-1">
                  <div className="flex gap-3 px-1 pb-3">
                    {app.screenshots.map((src) => (
                      <a
                        key={src}
                        href={src}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block shrink-0 overflow-hidden rounded-xl border border-border/60 bg-muted/40 transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <img
                          src={src}
                          alt={`${app.name} screenshot`}
                          loading="lazy"
                          className="h-64 w-auto max-w-[80vw] object-cover sm:max-w-none"
                        />
                      </a>
                    ))}
                  </div>
                  <ScrollBar orientation="horizontal" />
                </ScrollArea>
              )}

              {/* Description */}
              {app.description && (
                <>
                  <Separator />
                  <MarkdownContent content={app.description} className="text-base" />
                </>
              )}

              {/* Latest release notes */}
              {latestRelease?.notes && (
                <section className="space-y-3 border-t border-border/60 pt-6">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="text-xl font-semibold tracking-tight">
                      What&rsquo;s new
                      {latestRelease.version && (
                        <span className="ml-2 font-mono text-sm font-normal text-muted-foreground">
                          v{latestRelease.version}
                        </span>
                      )}
                    </h2>
                    <Link
                      to={`/${latestRelease.naddr}`}
                      className="text-sm font-medium text-primary hover:underline"
                    >
                      View release
                    </Link>
                  </div>
                  <MarkdownContent content={latestRelease.notes} className="text-sm" />
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

            {hasSidebar && (
              <aside aria-label="App resources" className="space-y-4 lg:sticky lg:top-24">
                {showOwnerNudge &&
                  (linkedApp ? (
                    <AppLinksNudge app={linkedApp} />
                  ) : (
                    <CreateAppListingNudge zapstoreAddress={app.address} />
                  ))}
                {app.website && (
                  <Card className="gap-2">
                    <CardHeader>
                      <SidebarCardTitle icon={<ExternalLink className="size-4" aria-hidden="true" />}>
                        Links
                      </SidebarCardTitle>
                    </CardHeader>
                    <CardContent className="space-y-1.5">
                      <a
                        href={app.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group flex items-center gap-2.5 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 transition-colors hover:border-primary/40 hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">
                          {(() => {
                            try {
                              return new URL(app.website).hostname.replace(/^www\./, '');
                            } catch {
                              return app.website;
                            }
                          })()}
                        </span>
                        <ExternalLink
                          className="size-4 shrink-0 text-muted-foreground/50 transition-colors group-hover:text-primary"
                          aria-hidden="true"
                        />
                      </a>
                      <a
                        href={externalUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group flex items-center gap-2.5 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 transition-colors hover:border-primary/40 hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">
                          View on Zapstore
                        </span>
                        <ExternalLink
                          className="size-4 shrink-0 text-muted-foreground/50 transition-colors group-hover:text-primary"
                          aria-hidden="true"
                        />
                      </a>
                    </CardContent>
                  </Card>
                )}

                {(releases.data?.length ?? 0) > 0 && (
                  <Card className="gap-2">
                    <CardHeader>
                      <SidebarCardTitle icon={<Package className="size-4" aria-hidden="true" />}>
                        Releases
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          {releases.data!.length}
                        </span>
                      </SidebarCardTitle>
                    </CardHeader>
                    <CardContent>
                      {/* Cap the history at a scrollbox so a long release log
                          doesn't dominate the page. */}
                      <div className="max-h-80 space-y-1.5 overflow-y-auto pr-1">
                        {latestRelease && <ReleaseHistoryRow release={latestRelease} />}
                        {olderReleases.map((release) => (
                          <ReleaseHistoryRow key={release.address} release={release} />
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Source code, implemented NIPs, and handled kinds from the
                    linked NIP-89 listing. The Install card is omitted here —
                    this page is the install destination. */}
                {linkedApp && <AppSidebar app={linkedApp} hideInstall />}
              </aside>
            )}
          </div>
        </article>
      )}
    </Layout>
  );
}

export default ZapstoreAppPage;
