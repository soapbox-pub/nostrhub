import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { nip19 } from 'nostr-tools';
import { AlertCircle, Blocks, BookOpen, ChevronDown, ChevronRight, ExternalLink, FolderGit2, Pencil, ShoppingBag } from 'lucide-react';
import { Layout } from '@/components/Layout';
import { BackLink, DetailHero } from '@/components/DetailHero';
import { DetailSurface } from '@/components/DetailSurface';
import { CommentsSection } from '@/components/comments/CommentsSection';
import { UserAvatar } from '@/components/UserAvatar';
import { ExpertToggleButton } from '@/components/ExpertToggleButton';
import { TierBadge } from '@/components/TierBadge';
import { KindBadge } from '@/components/KindBadge';
import { AppReviewForm } from '@/components/AppReviewForm';
import { AppReviewCard } from '@/components/AppReviewCard';
import { ClientMetrics } from '@/components/ClientMetrics';
import { SidebarCardTitle } from '@/components/CrossRefCards';
import { useApp } from '@/hooks/useApps';
import { useAppReviews } from '@/hooks/useAppReviews';
import { useAuthor } from '@/hooks/useAuthor';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useCustomNipByAddress } from '@/hooks/useCustomNips';
import { useGitRepo } from '@/hooks/useGitRepo';
import { useOfficialNips } from '@/hooks/useOfficialNips';
import { useZapstoreApp } from '@/hooks/useZapstoreSearch';
import { shortNpub } from '@/lib/nostr';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import {
  TIERS,
  TRACKED_NIPS,
  aggregateReviews,
  type TierAggregate,
} from '@/lib/appReviews';
import type { AppInfo, AppNipRef, AppRepoRef, AppZapstoreRef } from '@/lib/apps';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface AppPageProps {
  /** Hex pubkey of the app publisher (from the naddr). */
  pubkey: string;
  /** The `d` tag identifier (from the naddr). */
  identifier: string;
}

/** Shared shell for a related-content row: icon block, title, sublabel, link affordance. */
function RefRow({
  to, href, icon, title, sublabel,
}: {
  /** Internal route target (rendered as a router Link). */
  to?: string;
  /** External target (rendered as a new-tab anchor). Ignored when `to` is set. */
  href?: string;
  icon: React.ReactNode;
  title: React.ReactNode;
  sublabel?: React.ReactNode;
}) {
  const body = (
    <>
      <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-lg bg-muted text-muted-foreground">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium leading-snug">
          {title}
        </span>
        {sublabel && (
          <span className="block truncate text-xs text-muted-foreground">{sublabel}</span>
        )}
      </span>
      {to ? (
        <ChevronRight
          className="size-4 shrink-0 text-muted-foreground/50 transition-colors group-hover:text-primary"
          aria-hidden="true"
        />
      ) : href ? (
        <ExternalLink
          className="size-4 shrink-0 text-muted-foreground/50 transition-colors group-hover:text-primary"
          aria-hidden="true"
        />
      ) : null}
    </>
  );

  const className = cn(
    'group flex w-full items-center gap-2.5 rounded-lg border border-border/60 bg-muted/20 px-3 py-2',
    (to || href) && 'transition-colors hover:border-primary/40 hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
  );

  if (to) return <Link to={to} className={className}>{body}</Link>;
  if (href) return <a href={href} target="_blank" rel="noopener noreferrer" className={className}>{body}</a>;
  return <div className={className}>{body}</div>;
}

/** Loading placeholder matching RefRow's layout. */
function RefRowSkeleton() {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
      <Skeleton className="size-9 shrink-0 rounded-lg" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-4 w-32 max-w-full" />
        <Skeleton className="h-3 w-44 max-w-full" />
      </div>
    </div>
  );
}

/** An official NIP reference — resolves the title from the live NIP index. */
function OfficialNipRefRow({ number }: { number: string }) {
  const { data: officialNips } = useOfficialNips();
  const title = officialNips?.find(
    (n) => n.number.toUpperCase() === number.toUpperCase(),
  )?.title;

  return (
    <RefRow
      to={`/nip/${number.toLowerCase()}`}
      icon={<BookOpen className="size-4" aria-hidden="true" />}
      title={
        <>
          <span className="font-mono text-primary">NIP-{number}</span>
          {title && <span className="font-normal text-foreground/90"> · {title}</span>}
        </>
      }
      sublabel="Official protocol NIP"
    />
  );
}

/** A community NIP reference (kind 30817) — resolves title and author. */
function CustomNipRefRow({ address }: { address: string }) {
  const { data: nip, isLoading } = useCustomNipByAddress(address);
  const author = useAuthor(nip?.author);

  if (isLoading) return <RefRowSkeleton />;

  if (!nip) {
    // Listing references a NIP our relays don't carry; keep it reachable.
    const parts = address.split(':');
    let to: string | undefined;
    try {
      if (parts.length === 3 && parts[1].length === 64) {
        to = '/' + nip19.naddrEncode({ kind: 30817, pubkey: parts[1], identifier: parts[2] });
      }
    } catch { /* leave unlinked */ }
    return (
      <RefRow
        to={to}
        icon={<BookOpen className="size-4" aria-hidden="true" />}
        title={parts[2] ?? address}
        sublabel="Community NIP · not found on your relays"
      />
    );
  }

  const meta = author.data?.metadata;
  const authorName = meta?.name || meta?.display_name || shortNpub(nip.author);

  return (
    <RefRow
      to={`/${nip.naddr}`}
      icon={<BookOpen className="size-4" aria-hidden="true" />}
      title={nip.title}
      sublabel={`Community NIP · by ${authorName}`}
    />
  );
}

/** A NIP reference row — official or community. */
function NipRefRow({ nipRef }: { nipRef: AppNipRef }) {
  return nipRef.type === 'official'
    ? <OfficialNipRefRow number={nipRef.number} />
    : <CustomNipRefRow address={nipRef.address} />;
}

/** A git repo reference (kind 30617) — resolves name and description. */
function RepoRefRow({ repoRef }: { repoRef: AppRepoRef }) {
  const { data, isLoading } = useGitRepo({
    pubkey: repoRef.pubkey,
    identifier: repoRef.identifier,
    relays: repoRef.relayHint ? [repoRef.relayHint] : undefined,
  });
  const repo = data?.repo;

  if (isLoading) return <RefRowSkeleton />;

  const to = (() => {
    try { return '/' + nip19.naddrEncode({ kind: 30617, pubkey: repoRef.pubkey, identifier: repoRef.identifier }); }
    catch { return undefined; }
  })();

  return (
    <RefRow
      to={to}
      icon={<FolderGit2 className="size-4" aria-hidden="true" />}
      title={repo?.name ?? repoRef.identifier}
      sublabel={repo?.description || (repo ? `Git repository · ${repo.identifier}` : 'Git repository on Nostr')}
    />
  );
}

/** A Zapstore listing reference (kind 32267) — resolves name, icon, and summary. */
function ZapstoreRefRow({ zapRef }: { zapRef: AppZapstoreRef }) {
  const { data: app, isLoading } = useZapstoreApp(zapRef.pubkey, zapRef.identifier);

  if (isLoading) return <RefRowSkeleton />;

  const icon = sanitizeUrl(app?.icon);

  return (
    <RefRow
      href={`https://zap.store/${zapRef.identifier}`}
      icon={
        icon ? (
          <img src={icon} alt="" loading="lazy" className="size-full object-cover" />
        ) : (
          <ShoppingBag className="size-4" aria-hidden="true" />
        )
      }
      title={app?.name ?? zapRef.identifier}
      sublabel={app?.summary || `Zapstore · ${zapRef.identifier}`}
    />
  );
}

/** Whether the app declares anything worth a sidebar. */
function hasSidebarContent(app: AppInfo): boolean {
  return (
    app.zapstoreRefs.length > 0 ||
    app.repoRefs.length > 0 ||
    app.nipRefs.length > 0 ||
    app.supportedKinds.length > 0
  );
}

/** Sidebar cards: install builds, source repos, implemented NIPs, handled kinds. */
function AppSidebar({ app }: { app: AppInfo }) {
  return (
    <>
      {app.zapstoreRefs.length > 0 && (
        <Card className="gap-2">
          <CardHeader>
            <SidebarCardTitle icon={<ShoppingBag className="size-4" aria-hidden="true" />}>
              Install
            </SidebarCardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {app.zapstoreRefs.map((zapRef) => <ZapstoreRefRow key={zapRef.address} zapRef={zapRef} />)}
          </CardContent>
        </Card>
      )}
      {app.repoRefs.length > 0 && (
        <Card className="gap-2">
          <CardHeader>
            <SidebarCardTitle icon={<FolderGit2 className="size-4" aria-hidden="true" />}>
              Source Code
            </SidebarCardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {app.repoRefs.map((repoRef) => <RepoRefRow key={repoRef.address} repoRef={repoRef} />)}
          </CardContent>
        </Card>
      )}
      {app.nipRefs.length > 0 && (
        <Card className="gap-2">
          <CardHeader>
            <SidebarCardTitle icon={<BookOpen className="size-4" aria-hidden="true" />}>
              Implements
            </SidebarCardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {app.nipRefs.map((nipRef) => (
              <NipRefRow
                key={nipRef.type === 'official' ? `nip-${nipRef.number}` : nipRef.address}
                nipRef={nipRef}
              />
            ))}
          </CardContent>
        </Card>
      )}
      {app.supportedKinds.length > 0 && (
        <Card className="gap-2">
          <CardHeader>
            <SidebarCardTitle icon={<Blocks className="size-4" aria-hidden="true" />}>
              Handled Kinds
            </SidebarCardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1.5">
              {app.supportedKinds.map((kind) => (
                <KindBadge key={kind} kind={kind} />
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground/80">
              Event kinds this app announces it can display or handle (NIP-89).
            </p>
          </CardContent>
        </Card>
      )}
    </>
  );
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
                row and the action row, keyed on the app name as `#client`. */}
            {app.name && <ClientMetrics clientTags={[app.name]} />}
          </DetailHero>
          </DetailSurface>

          {/* Description and details on the left, resource cards on the right —
              the sidebar starts at description level, below the name row. */}
          <div
            className={cn(
              'space-y-6',
              hasSidebarContent(app) &&
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
                      <Badge key={tag} variant="secondary" className="font-normal">
                        #{tag}
                      </Badge>
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

            {hasSidebarContent(app) && (
              <aside aria-label="App resources" className="space-y-4 lg:sticky lg:top-24">
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
