import { Link } from 'react-router-dom';
import { nip19 } from 'nostr-tools';
import { Blocks, BookOpen, FolderGit2, GitFork, LayoutGrid } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { UserAvatar } from '@/components/UserAvatar';
import { useCustomNipByAddress } from '@/hooks/useCustomNips';
import { useGitRepo } from '@/hooks/useGitRepo';
import { useOfficialNips } from '@/hooks/useOfficialNips';
import { useBuds } from '@/hooks/useBuds';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import type { CustomNip } from '@/lib/nips';
import type { AppInfo, AppNipRef, AppRepoRef } from '@/lib/apps';

/**
 * Cross-reference sidebar cards. NIP-89 app listings (kind 31990) are the
 * nexus of discoverability: they reference the NIPs they implement and the
 * repos they're built from. These cards surface those edges on NIP, repo,
 * and app pages.
 */

const CHIP_CLASS =
  'flex items-center gap-2.5 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 transition-colors hover:border-primary/40 hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

/** Loading placeholder matching the chip layout. */
function ChipSkeleton() {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
      <Skeleton className="h-4 w-32" />
    </div>
  );
}

/** Sidebar card heading: icon + uppercase muted title (house style). */
export function SidebarCardTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
      {icon}
      {children}
    </CardTitle>
  );
}

/** A compact app row for cross-reference lists. */
export function AppChip({ app }: { app: AppInfo }) {
  const icon = sanitizeUrl(app.picture);
  return (
    <Link to={`/${app.naddr}`} className={CHIP_CLASS}>
      <span className="grid size-7 shrink-0 place-items-center overflow-hidden rounded-lg bg-muted">
        {icon
          ? <img src={icon} alt="" className="size-full object-cover" />
          : <Blocks className="size-4 text-muted-foreground" aria-hidden="true" />}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{app.name}</span>
    </Link>
  );
}

/** A compact repo row — resolves name from the NIP-34 announcement. */
export function RepoChip({ repoRef }: { repoRef: AppRepoRef }) {
  const { data, isLoading } = useGitRepo({
    pubkey: repoRef.pubkey,
    identifier: repoRef.identifier,
    relays: repoRef.relayHint ? [repoRef.relayHint] : undefined,
  });

  if (isLoading) return <ChipSkeleton />;

  const to = (() => {
    try { return '/' + nip19.naddrEncode({ kind: 30617, pubkey: repoRef.pubkey, identifier: repoRef.identifier }); }
    catch { return undefined; }
  })();
  const name = data?.repo?.name ?? repoRef.identifier;

  const body = (
    <span className="min-w-0 flex-1 truncate text-sm font-medium">{name}</span>
  );

  if (!to) {
    return (
      <div className="flex items-center gap-2.5 rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
        {body}
      </div>
    );
  }

  return <Link to={to} className={CHIP_CLASS}>{body}</Link>;
}

/** A compact NIP row — official (resolved from the NIP index), BUD, or community. */
export function NipChip({ nipRef }: { nipRef: AppNipRef }) {
  if (nipRef.type === 'official') return <OfficialNipChip number={nipRef.number} />;
  if (nipRef.type === 'bud') return <BudChip number={nipRef.number} />;
  return <CustomNipChip address={nipRef.address} />;
}

function OfficialNipChip({ number }: { number: string }) {
  const { data: officialNips } = useOfficialNips();
  const title = officialNips?.find(
    (n) => n.number.toUpperCase() === number.toUpperCase(),
  )?.title;

  return (
    <Link to={`/nip/${number.toLowerCase()}`} className={CHIP_CLASS}>
      <span className="min-w-0 flex-1 truncate text-sm font-medium">
        <span className="font-mono text-primary">NIP-{number}</span>
        {title && <span className="text-foreground/90"> · {title}</span>}
      </span>
    </Link>
  );
}

function BudChip({ number }: { number: string }) {
  const { data: buds } = useBuds();
  const title = buds?.find((b) => b.number === number)?.title;

  return (
    <Link to={`/bud/${number}`} className={CHIP_CLASS}>
      <span className="min-w-0 flex-1 truncate text-sm font-medium">
        <span className="font-mono text-primary">BUD-{number}</span>
        {title && <span className="text-foreground/90"> · {title}</span>}
      </span>
    </Link>
  );
}

function CustomNipChip({ address }: { address: string }) {
  const { data: nip, isLoading } = useCustomNipByAddress(address);

  if (isLoading) return <ChipSkeleton />;

  const to = (() => {
    if (nip) return `/${nip.naddr}`;
    const parts = address.split(':');
    try {
      if (parts.length === 3 && parts[1].length === 64) {
        return '/' + nip19.naddrEncode({ kind: 30817, pubkey: parts[1], identifier: parts[2] });
      }
    } catch { /* leave unlinked */ }
    return undefined;
  })();
  const label = nip?.title ?? address.split(':')[2] ?? address;

  const body = (
    <span className="min-w-0 flex-1 truncate text-sm font-medium">{label}</span>
  );

  if (!to) {
    return (
      <div className="flex items-center gap-2.5 rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
        {body}
      </div>
    );
  }

  return <Link to={to} className={CHIP_CLASS}>{body}</Link>;
}

/** Sidebar card: apps whose NIP-89 listing references this NIP or repo. */
export function UsedByAppsCard({ apps }: { apps: AppInfo[] }) {
  if (apps.length === 0) return null;
  return (
    <Card className="gap-2">
      <CardHeader>
        <SidebarCardTitle icon={<LayoutGrid className="size-4" aria-hidden="true" />}>
          Used by apps
        </SidebarCardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {apps.map((app) => <AppChip key={app.address} app={app} />)}
      </CardContent>
    </Card>
  );
}

/** Sidebar card: repos associated through the NIP-89 listings of those apps. */
export function RelatedReposCard({ repoRefs }: { repoRefs: AppRepoRef[] }) {
  if (repoRefs.length === 0) return null;
  return (
    <Card className="gap-2">
      <CardHeader>
        <SidebarCardTitle icon={<FolderGit2 className="size-4" aria-hidden="true" />}>
          Related Repos
        </SidebarCardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {repoRefs.map((repoRef) => <RepoChip key={repoRef.address} repoRef={repoRef} />)}
      </CardContent>
    </Card>
  );
}

/** A compact fork row — links to the forked community NIP, with author avatar. */
function ForkChip({ fork }: { fork: CustomNip }) {
  return (
    <Link to={`/${fork.naddr}`} className={CHIP_CLASS}>
      <UserAvatar pubkey={fork.author} size="sm" />
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{fork.title}</span>
    </Link>
  );
}

/**
 * Sidebar card: expert-authored forks of this NIP. The count in the title
 * reflects only forks authored by the configured expert set (a meaningful
 * curation signal), matching how approvals and ranking are scoped.
 */
export function ExpertForksCard({
  forks,
  isLoading,
}: {
  forks: CustomNip[];
  isLoading?: boolean;
}) {
  if (!isLoading && forks.length === 0) return null;
  return (
    <Card className="gap-2">
      <CardHeader>
        <SidebarCardTitle icon={<GitFork className="size-4" aria-hidden="true" />}>
          Forks
          {!isLoading && (
            <span className="ml-auto font-mono text-foreground" aria-label={`${forks.length} forks`}>
              {forks.length}
            </span>
          )}
        </SidebarCardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {isLoading
          ? <ChipSkeleton />
          : forks.map((fork) => <ForkChip key={fork.address} fork={fork} />)}
      </CardContent>
    </Card>
  );
}

/** Sidebar card: NIPs associated through the NIP-89 listings of those apps. */
export function RelatedNipsCard({ nipRefs }: { nipRefs: AppNipRef[] }) {
  if (nipRefs.length === 0) return null;
  return (
    <Card className="gap-2">
      <CardHeader>
        <SidebarCardTitle icon={<BookOpen className="size-4" aria-hidden="true" />}>
          Related NIPs
        </SidebarCardTitle>
      </CardHeader>
      <CardContent className="max-h-72 space-y-1.5 overflow-y-auto overscroll-contain">
        {nipRefs.map((nipRef) => (
          <NipChip
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
  );
}
