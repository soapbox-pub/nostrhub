import { useSeoMeta } from '@unhead/react';
import { Link } from 'react-router-dom';
import { nip19 } from 'nostr-tools';
import { AlertCircle, ExternalLink, Package, ShoppingBag } from 'lucide-react';
import { Layout } from '@/components/Layout';
import { BackLink, DetailHero } from '@/components/DetailHero';
import { DetailSurface } from '@/components/DetailSurface';
import { MarkdownContent } from '@/components/MarkdownContent';
import { CommentsSection } from '@/components/comments/CommentsSection';
import { UserAvatar } from '@/components/UserAvatar';
import { AppSidebar, AppLinksNudge, CreateAppListingNudge } from '@/components/AppSidebar';
import { useAuthor } from '@/hooks/useAuthor';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAppForZapstore } from '@/hooks/useApps';
import { hasSidebarContent } from '@/lib/apps';
import {
  useZapstoreApp,
  useZapstoreRelease,
  useZapstoreAssets,
  zapstoreAppUrl,
  ZAPSTORE_APP_KIND,
} from '@/hooks/useZapstoreSearch';
import { releaseDisplayName, formatAssetSize, primaryAsset } from '@/lib/zapstore';
import { AssetDownloadButton } from '@/components/AssetDownloadButton';
import { shortNpub } from '@/lib/nostr';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';

interface ZapstoreReleasePageProps {
  /** Hex pubkey of the release publisher (from the naddr). */
  pubkey: string;
  /** The `d` tag identifier — usually `app-id@version` (from the naddr). */
  identifier: string;
}

const CHANNEL_LABELS: Record<string, string> = {
  beta: 'Beta',
  nightly: 'Nightly',
  dev: 'Dev',
};

/** Detail view for a single Zapstore software release (kind 30063). */
export function ZapstoreReleasePage({ pubkey, identifier }: ZapstoreReleasePageProps) {
  const { data: release, isLoading, isError } = useZapstoreRelease(pubkey, identifier);
  const author = useAuthor(pubkey);
  const { user } = useCurrentUser();
  const isOwner = user?.pubkey === pubkey;
  const authorMeta = author.data?.metadata;
  const authorName = authorMeta?.name || authorMeta?.display_name || shortNpub(pubkey);

  // Resolve the parent app listing for naming, icon, and the in-app link back.
  const appIdentifier = release?.appIdentifier;
  const app = useZapstoreApp(pubkey, appIdentifier);

  // The NIP-89 listing (kind 31990) tied to this release's app carries the
  // repos, NIPs, and handled kinds — the same sidebar the app page shows.
  const linkedAppQuery = useAppForZapstore(pubkey, appIdentifier);
  const linkedApp = linkedAppQuery.data ?? undefined;

  // Downloadable assets (kind 3063) referenced by the release's `e` tags.
  const assets = useZapstoreAssets(pubkey, release?.assetIds ?? []);
  const downloads = assets.data ?? [];
  const primary = primaryAsset(downloads);

  const appName = app.data?.name || (release ? releaseDisplayName(release) : undefined);
  const channelLabel = release ? CHANNEL_LABELS[release.channel] : undefined;

  // naddr for the parent app page (kind 32267), so the release can link "up".
  const appNaddr = appIdentifier
    ? nip19.naddrEncode({ kind: ZAPSTORE_APP_KIND, pubkey, identifier: appIdentifier })
    : undefined;

  // External escape hatch — the Zapstore web page for the app.
  const externalUrl = appIdentifier ? zapstoreAppUrl(appIdentifier) : 'https://zapstore.dev';

  // Owner nudge: edit the listing's links, or create a listing when none
  // exists yet. The Zapstore app's coordinate prefills the submission form.
  const showOwnerNudge = isOwner && Boolean(appIdentifier) && !linkedAppQuery.isLoading;
  const zapstoreAddress = appIdentifier ? `32267:${pubkey}:${appIdentifier}` : undefined;

  const hasSidebar = Boolean(
    (linkedApp && hasSidebarContent(linkedApp)) || showOwnerNudge,
  );

  useSeoMeta({
    title: release
      ? `${appName ?? 'Release'}${release.version ? ` v${release.version}` : ''} | NostrHub`
      : 'Release | NostrHub',
    description: release?.notes?.slice(0, 160) || 'A software release on Zapstore.',
  });

  return (
    <Layout className={hasSidebar ? 'max-w-6xl' : 'max-w-3xl'}>
      <BackLink to={appNaddr ? `/${appNaddr}` : '/'}>
        {appNaddr ? `Back to ${appName ?? 'app'}` : 'Back'}
      </BackLink>

      {isLoading ? (
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <Skeleton className="size-14 rounded-2xl sm:size-16" />
            <div className="space-y-2">
              <Skeleton className="h-8 w-56" />
              <Skeleton className="h-4 w-40" />
            </div>
          </div>
          <Skeleton className="h-40 w-full" />
        </div>
      ) : isError || !release ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertDescription className="flex flex-wrap items-center gap-2">
            Could not load this release from your relays.
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
        <article
          className={
            hasSidebar
              ? 'lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-8'
              : ''
          }
        >
          <div className="min-w-0 space-y-6">
          <DetailSurface className="space-y-6">
            <DetailHero
              className="border-b-0 pb-0"
              icon={<Package className="size-7 text-primary" aria-hidden="true" />}
              image={app.data?.icon}
              kicker="Release"
              title={appName ?? 'Release'}
              subtitle={
                appNaddr ? (
                  <Link to={`/${appNaddr}`} className="hover:text-primary">
                    {release.appIdentifier}
                  </Link>
                ) : (
                  release.identifier
                )
              }
              badges={
                <>
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
                  {release.assetIds.length > 0 && (
                    <Badge variant="outline" className="text-[10px] tracking-wider">
                      {release.assetIds.length} asset{release.assetIds.length !== 1 ? 's' : ''}
                    </Badge>
                  )}
                </>
              }
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
              actions={
                appNaddr ? (
                  <Button asChild variant="outline" size="sm" className="gap-1.5">
                    <Link to={`/${appNaddr}`}>
                      <ShoppingBag className="size-4" aria-hidden="true" />
                      View app
                    </Link>
                  </Button>
                ) : undefined
              }
            />

            <div className="flex flex-wrap items-center gap-3">
              <Link
                to={`/${nip19.npubEncode(pubkey)}`}
                className="flex items-center gap-2 hover:text-primary"
              >
                <UserAvatar pubkey={pubkey} size="sm" />
                <span className="text-sm font-medium">by {authorName}</span>
              </Link>
              <span aria-hidden="true" className="text-muted-foreground">·</span>
              <time
                dateTime={new Date(release.createdAt * 1000).toISOString()}
                className="text-sm text-muted-foreground"
              >
                {new Date(release.createdAt * 1000).toLocaleDateString('en-US', {
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </time>
            </div>

            {release.notes ? (
              <>
                <Separator />
                <section className="space-y-3">
                  <h2 className="text-xl font-semibold tracking-tight">Release notes</h2>
                  <MarkdownContent content={release.notes} className="text-base" />
                </section>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No release notes were published.</p>
            )}

            {/* Downloads — surface every binary the release ships. */}
            {downloads.length > 0 && (
              <section className="space-y-3 border-t border-border/60 pt-6">
                <h2 className="text-xl font-semibold tracking-tight">Downloads</h2>
                <div className="space-y-2">
                  {downloads.map((asset) => (
                    <div
                      key={asset.event.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5"
                    >
                      <div className="min-w-0 space-y-0.5">
                        <p className="truncate text-sm font-medium">
                          {asset.filename ?? 'Binary'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {[
                            asset.architectures
                              .map((a) => a.replace(/^android-/, ''))
                              .join(', '),
                            asset.size !== undefined ? formatAssetSize(asset.size) : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <AssetDownloadButton asset={asset} variant="outline" className="h-9" />
                        {asset.urls[1] && (
                          <a
                            href={asset.urls[1]}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs font-medium text-muted-foreground underline underline-offset-2 hover:text-primary"
                          >
                            mirror
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground/80">
                  Downloads are hosted off-Nostr. Verify the source before installing.
                </p>
              </section>
            )}
          </DetailSurface>

          <DetailSurface as="section" className="space-y-4">
            <h2 className="text-xl font-semibold tracking-tight">Discussion</h2>
            <CommentsSection
              root={release.event}
              emptyStateMessage="No discussion yet"
              emptyStateSubtitle="Share your thoughts on this release."
            />
          </DetailSurface>
          </div>

          {hasSidebar && (
            <aside aria-label="App resources" className="mt-6 space-y-4 lg:mt-0 lg:sticky lg:top-24">
              {showOwnerNudge &&
                (linkedApp ? (
                  <AppLinksNudge app={linkedApp} />
                ) : zapstoreAddress ? (
                  <CreateAppListingNudge zapstoreAddress={zapstoreAddress} />
                ) : null)}
              {linkedApp && <AppSidebar app={linkedApp} />}
            </aside>
          )}
        </article>
      )}
    </Layout>
  );
}

export default ZapstoreReleasePage;
