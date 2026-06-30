import { Link } from 'react-router-dom';
import { nip19 } from 'nostr-tools';
import {
  Blocks,
  BookOpen,
  ChevronRight,
  ExternalLink,
  FolderGit2,
  Link2,
  Pencil,
  ShoppingBag,
} from 'lucide-react';
import { KindBadge } from '@/components/KindBadge';
import { SidebarCardTitle } from '@/components/CrossRefCards';
import { useAuthor } from '@/hooks/useAuthor';
import { useCustomNipByAddress } from '@/hooks/useCustomNips';
import { useGitRepo } from '@/hooks/useGitRepo';
import { useOfficialNips } from '@/hooks/useOfficialNips';
import { useBuds } from '@/hooks/useBuds';
import { useZapstoreApp, ZAPSTORE_APP_KIND } from '@/hooks/useZapstoreSearch';
import { shortNpub } from '@/lib/nostr';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import { ownZapstoreRefs } from '@/lib/apps';
import type { AppInfo, AppNipRef, AppRepoRef, AppZapstoreRef } from '@/lib/apps';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/** Shared shell for a related-content row: icon block, title, sublabel, link affordance. */
export function RefRow({
  to,
  href,
  icon,
  title,
  sublabel,
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
        <span className="block truncate text-sm font-medium leading-snug">{title}</span>
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
    (to || href) &&
      'transition-colors hover:border-primary/40 hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
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
    } catch {
      /* leave unlinked */
    }
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

/** A BUD reference — resolves the title from the live Blossom index. */
function BudRefRow({ number }: { number: string }) {
  const { data: buds } = useBuds();
  const title = buds?.find((b) => b.number === number)?.title;

  return (
    <RefRow
      to={`/bud/${number}`}
      icon={<BookOpen className="size-4" aria-hidden="true" />}
      title={
        <>
          <span className="font-mono text-primary">BUD-{number}</span>
          {title && <span className="font-normal text-foreground/90"> · {title}</span>}
        </>
      }
      sublabel="Blossom Upgrade Document"
    />
  );
}

/** A NIP reference row — official, BUD, or community. */
function NipRefRow({ nipRef }: { nipRef: AppNipRef }) {
  if (nipRef.type === 'official') return <OfficialNipRefRow number={nipRef.number} />;
  if (nipRef.type === 'bud') return <BudRefRow number={nipRef.number} />;
  return <CustomNipRefRow address={nipRef.address} />;
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
    try {
      return '/' + nip19.naddrEncode({ kind: 30617, pubkey: repoRef.pubkey, identifier: repoRef.identifier });
    } catch {
      return undefined;
    }
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

  // Link to the in-app Zapstore listing (kind 32267) rather than off to the
  // external Zapstore site — the in-app page carries release notes, downloads,
  // and an escape hatch out to Zapstore.
  const to = (() => {
    if (app?.naddr) return `/${app.naddr}`;
    try {
      return `/${nip19.naddrEncode({ kind: ZAPSTORE_APP_KIND, pubkey: zapRef.pubkey, identifier: zapRef.identifier })}`;
    } catch {
      return undefined;
    }
  })();

  return (
    <RefRow
      to={to}
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

/**
 * Owner-only nudge: prompt linking any cross-references the listing is missing.
 * The app listing (kind 31990) is the nexus tying a project's repo, NIPs, and
 * zapstore release together — an unlinked listing is a missed discovery
 * opportunity. Links straight into the edit wizard.
 */
export function AppLinksNudge({ app }: { app: AppInfo }) {
  const missing: string[] = [];
  if (ownZapstoreRefs(app).length === 0) missing.push('a Zapstore release');
  if (app.repoRefs.length === 0) missing.push('source code');
  if (app.nipRefs.length === 0) missing.push('the NIPs it implements');

  if (missing.length === 0) return null;

  const list =
    missing.length === 1
      ? missing[0]
      : `${missing.slice(0, -1).join(', ')} and ${missing[missing.length - 1]}`;

  return (
    <Card className="border-2 border-dashed border-primary/40 bg-primary/[0.03]">
      <CardContent className="space-y-3 py-5">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Link2 className="size-4 text-primary" aria-hidden="true" />
          Finish linking your app
        </div>
        <p className="text-sm text-muted-foreground">
          This listing is missing {list}. Linking them ties your project together
          and helps people discover it across NostrHub.
        </p>
        <Button asChild size="sm" className="w-full gap-1.5">
          <Link to={`/apps/edit/${app.naddr}`}>
            <Pencil className="size-4" aria-hidden="true" />
            Add links
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

/**
 * Owner-only nudge for a Zapstore app (kind 32267) that has no NIP-89 listing
 * (kind 31990) yet. The 31990 listing is what surfaces the app in the NostrHub
 * directory and ties it to its repos and NIPs — without it the Zapstore release
 * floats unconnected. Links into the submission form, prefilled with this
 * Zapstore listing.
 */
export function CreateAppListingNudge({ zapstoreAddress }: { zapstoreAddress: string }) {
  return (
    <Card className="border-2 border-dashed border-primary/40 bg-primary/[0.03]">
      <CardContent className="space-y-3 py-5">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Link2 className="size-4 text-primary" aria-hidden="true" />
          List this app on NostrHub
        </div>
        <p className="text-sm text-muted-foreground">
          This release has no app listing yet. Publishing one adds it to the app
          directory and lets you link its source code and the NIPs it implements.
        </p>
        <Button asChild size="sm" className="w-full gap-1.5">
          <Link to={`/apps/submit?zapstore=${encodeURIComponent(zapstoreAddress)}`}>
            <Pencil className="size-4" aria-hidden="true" />
            Create listing
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

/** Sidebar cards: install builds, source repos, implemented NIPs, handled kinds. */
export function AppSidebar({ app, hideInstall = false }: { app: AppInfo; hideInstall?: boolean }) {
  const zapstoreRefs = ownZapstoreRefs(app);
  return (
    <>
      {!hideInstall && zapstoreRefs.length > 0 && (
        <Card className="gap-2">
          <CardHeader>
            <SidebarCardTitle icon={<ShoppingBag className="size-4" aria-hidden="true" />}>
              Install
            </SidebarCardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {zapstoreRefs.map((zapRef) => <ZapstoreRefRow key={zapRef.address} zapRef={zapRef} />)}
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
                key={
                  nipRef.type === 'official'
                    ? `nip-${nipRef.number}`
                    : nipRef.type === 'bud'
                      ? `bud-${nipRef.number}`
                      : nipRef.address
                }
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
