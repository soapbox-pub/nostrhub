import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { nip19 } from 'nostr-tools';
import { GitFork, AlertCircle, Pencil, Trash2, History, GitCompare, MessageSquareDashed } from 'lucide-react';
import { FollowNipButton } from '@/components/FollowNipButton';
import { Layout } from '@/components/Layout';
import { BackLink, DetailHero } from '@/components/DetailHero';
import { DetailSurface } from '@/components/DetailSurface';
import { HighlightableMarkdown } from '@/components/HighlightableMarkdown';
import { ApproveButton } from '@/components/ApproveButton';
import { ExpertApprovers } from '@/components/ExpertApprovers';
import { CommentsSection } from '@/components/comments/CommentsSection';
import { UserAvatar } from '@/components/UserAvatar';
import { NipActionsMenu } from '@/components/NipActionsMenu';
import { RelatedReposCard, UsedByAppsCard, ForksCard } from '@/components/CrossRefCards';
import { LinkAppNudge } from '@/components/LinkAppNudge';
import { RevisionsDialog } from '@/components/RevisionsDialog';
import { CUSTOM_NIP_KIND, type NipFork } from '@/lib/nips';
import { useCustomNip, useCustomNipByAddress, useCustomNipByEventId } from '@/hooks/useCustomNips';
import { forkSourceRefs } from '@/hooks/useResolvedNip';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import { useForksOfCustomNip } from '@/hooks/useForksOfNip';
import { useDeleteNip } from '@/hooks/useSaveNip';
import { useAuthor } from '@/hooks/useAuthor';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useToast } from '@/hooks/useToast';
import { useAppsForCustomNip } from '@/hooks/useAppsForNip';
import { shortNpub } from '@/lib/nostr';
import { uniqueRepoRefs, isBudUrl, budNumberFromUrl, nipNumberFromUrl } from '@/lib/apps';
import { cn } from '@/lib/utils';
import type { NipTarget } from '@/hooks/useNipApprovals';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const compareHref = (a: string, b: string) =>
  `/compare?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`;

/**
 * "Forked from <source>" with links to diff the fork against its source — both
 * as the source is now and, when the fork pinned it, as it was when forked.
 */
function ForkSourceLine({ fork, naddr }: { fork: NipFork; naddr: string }) {
  const customSource = useCustomNipByAddress(fork.type === 'custom' ? fork.address : undefined);
  const sourcePubkey = fork.type === 'custom' ? fork.address.split(':')[1] : undefined;
  const sourceAuthor = useAuthor(sourcePubkey);
  const refs = forkSourceRefs(fork);

  let source: React.ReactNode;
  if (fork.type === 'official') {
    const bud = budNumberFromUrl(fork.url);
    const number = bud ?? nipNumberFromUrl(fork.url);
    source = number ? (
      <Link to={bud ? `/bud/${bud}` : `/nip/${number}`} className="font-medium text-primary hover:underline">
        {bud ? `BUD-${bud}` : `NIP-${number}`}
      </Link>
    ) : (
      <a href={sanitizeUrl(fork.url)} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
        {isBudUrl(fork.url) ? 'a Blossom BUD' : 'an official NIP'}
      </a>
    );
  } else {
    const parts = fork.address.split(':');
    let to: string | undefined;
    try {
      to = `/${nip19.naddrEncode({ kind: CUSTOM_NIP_KIND, pubkey: parts[1], identifier: parts[2] ?? '' })}`;
    } catch {
      to = undefined;
    }
    const title = customSource.data?.title ?? (customSource.isLoading ? '…' : 'a community NIP');
    const authorName =
      sourceAuthor.data?.metadata?.name ||
      sourceAuthor.data?.metadata?.display_name ||
      (sourcePubkey && /^[0-9a-f]{64}$/.test(sourcePubkey) ? shortNpub(sourcePubkey) : undefined);
    source = (
      <>
        {to ? (
          <Link to={to} className="font-medium text-primary hover:underline">{title}</Link>
        ) : (
          <span className="font-medium text-foreground">{title}</span>
        )}
        {authorName && <> by {authorName}</>}
      </>
    );
  }

  return (
    <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-muted-foreground">
      <GitFork className="size-3.5" aria-hidden="true" />
      <span>Forked from {source}</span>
      <span aria-hidden="true">·</span>
      {refs.pinned ? (
        <>
          <Link
            to={compareHref(refs.pinned, naddr)}
            className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
          >
            <GitCompare className="size-3.5" aria-hidden="true" /> Changes since fork
          </Link>
          <span aria-hidden="true">·</span>
          <Link
            to={compareHref(refs.pinned, refs.latest)}
            className="font-medium text-primary hover:underline"
          >
            Upstream changes
          </Link>
        </>
      ) : (
        <Link
          to={compareHref(refs.latest, naddr)}
          className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
        >
          <GitCompare className="size-3.5" aria-hidden="true" /> Compare with source
        </Link>
      )}
    </p>
  );
}

/** Detail view for a community-authored NIP (kind 30817), routed via its naddr. */
export function CustomNipPage({ naddr, eventId }: { naddr?: string; eventId?: string }) {
  // When `eventId` is set we render a version-pinned revision (from a nevent);
  // otherwise we resolve the latest version from the naddr.
  const isPinned = !!eventId;
  const naddrQuery = useCustomNip(isPinned ? undefined : naddr);
  const pinnedQuery = useCustomNipByEventId(eventId);
  const { data: nip, isLoading, isError } = isPinned ? pinnedQuery : naddrQuery;
  const { user } = useCurrentUser();
  const author = useAuthor(nip?.author);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { mutateAsync: deleteNip, isPending: isDeleting } = useDeleteNip();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showRevisions, setShowRevisions] = useState(false);
  const authorName =
    author.data?.metadata?.name || author.data?.metadata?.display_name || (nip ? shortNpub(nip.author) : '');
  const appsForNip = useAppsForCustomNip(nip?.address);

  // The NIP-89 listing is the nexus: apps point at both this NIP and the
  // repos implementing it, giving us related repos by association.
  const apps = appsForNip.data ?? [];
  const repoRefs = uniqueRepoRefs(apps);

  // Community forks of this NIP, expert forks first.
  const forksQuery = useForksOfCustomNip(nip?.address);
  const forks = forksQuery.data ?? [];

  useSeoMeta({
    title: nip ? `${nip.title} | NostrHub` : 'NIP | NostrHub',
    description: nip ? `${nip.title}: a community NIP on NostrHub.` : undefined,
  });

  // Approvals pin the revision on screen, and approvals of others show as stale.
  const target: NipTarget | null = useMemo(
    () =>
      nip
        ? { type: 'custom', address: nip.address, revision: { id: nip.event.id, createdAt: nip.createdAt } }
        : null,
    [nip],
  );
  const isOwner = !!user && !!nip && user.pubkey === nip.author;
  const showSidebar = apps.length > 0 || forks.length > 0 || forksQuery.isLoading || isOwner;

  const handleDelete = async () => {
    if (!nip) return;
    try {
      await deleteNip(nip);
      toast({ title: 'NIP deleted' });
      setShowDeleteDialog(false);
      navigate('/');
    } catch (error) {
      toast({
        title: 'Failed to delete NIP',
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      });
    }
  };

  return (
    <Layout className={showSidebar ? 'max-w-6xl' : undefined}>
      <BackLink to="/nips">Back to NIPs</BackLink>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-9 w-2/3" />
          <Skeleton className="h-5 w-1/3" />
          <Skeleton className="mt-6 h-64 w-full" />
        </div>
      ) : isError || !nip || !target ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertDescription>Could not load this NIP. It may not exist on your relays.</AlertDescription>
        </Alert>
      ) : (
        <article>
          <DetailSurface>
          <DetailHero
            title={nip.title}
            meta={
              <>
                <Link to={`/${nip19.npubEncode(nip.author)}`} className="flex items-center gap-2 hover:text-primary">
                  <UserAvatar pubkey={nip.author} size="sm" />
                  <span className="text-sm font-medium text-foreground">{authorName}</span>
                </Link>
                <ExpertApprovers target={target} />
              </>
            }
            primaryAction={<ApproveButton target={target} />}
            actions={
              <>
                {isOwner && (
                  <Button variant="outline" size="sm" asChild className="gap-1.5">
                    <Link to={`/edit/${nip.naddr}`}>
                      <Pencil className="size-4" aria-hidden="true" /> Edit
                    </Link>
                  </Button>
                )}
                <FollowNipButton target={target} />
                <Button variant="outline" size="sm" asChild className="gap-1.5">
                  <Link to={`/create?fork=${nip.naddr}`}>
                    <GitFork className="size-4" aria-hidden="true" /> Fork
                  </Link>
                </Button>
                {isOwner && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-destructive hover:text-destructive"
                    onClick={() => setShowDeleteDialog(true)}
                  >
                    <Trash2 className="size-4" aria-hidden="true" /> Delete
                  </Button>
                )}
              </>
            }
          >
            {nip.status === 'review' && (
              <Alert>
                <MessageSquareDashed className="size-4" />
                <AlertDescription>
                  <span>
                    <span className="font-medium text-foreground">Open for review.</span> The author is
                    asking for feedback before calling this NIP final — comment, highlight, or fork it below.
                  </span>
                </AlertDescription>
              </Alert>
            )}
            {isPinned && (
              <Alert>
                <History className="size-4" />
                <AlertDescription>
                  <span>
                    You're viewing a past revision of this NIP.{' '}
                    <Link to={`/${nip.naddr}`} className="font-medium text-primary hover:underline">
                      View the latest version
                    </Link>.
                  </span>
                </AlertDescription>
              </Alert>
            )}
            {nip.fork && <ForkSourceLine fork={nip.fork} naddr={nip.naddr} />}
          </DetailHero>
          </DetailSurface>

          {/* Below the hero: NIP text + discussion on the left, cross-references
              from NIP-89 app listings on the right. */}
          <div
            className={cn(
              'mt-6 space-y-6',
              showSidebar &&
                'lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-8 lg:space-y-0',
            )}
          >
            <DetailSurface className="relative min-w-0">
              <NipActionsMenu
                naddr={nip.naddr}
                content={nip.content}
                className="absolute right-4 top-4 sm:right-6 sm:top-6 z-10"
              />
              <HighlightableMarkdown
                content={nip.content}
                source={{ type: 'addressable', addr: nip.address, pubkey: nip.author }}
              />

              <p className="mt-8 border-t border-border/60 pt-4 text-sm text-muted-foreground">
                {isPinned ? 'This revision published' : 'Published'}{' '}
                {new Date(nip.createdAt * 1000).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
                {' · '}
                <button
                  type="button"
                  onClick={() => setShowRevisions(true)}
                  className="font-medium text-primary hover:underline"
                >
                  View revisions
                </button>
              </p>

              <section className="mt-10 space-y-4 border-t border-border/60 pt-6">
                <h2 className="text-xl font-semibold tracking-tight">Discussion</h2>
                <CommentsSection
                  root={nip.event}
                  emptyStateMessage="No discussion yet"
                  emptyStateSubtitle="Share feedback on this NIP with the community."
                />
              </section>
            </DetailSurface>

            {showSidebar && (
              <aside aria-label="NIP cross-references" className="space-y-4 lg:sticky lg:top-24">
                <LinkAppNudge
                  target={{
                    kind: 'customNip',
                    address: nip.address,
                    ownerPubkey: nip.author,
                    label: nip.title,
                  }}
                  linkedApps={apps}
                />
                <UsedByAppsCard apps={apps} kinds={nip.kinds} />
                <ForksCard forks={forks} isLoading={forksQuery.isLoading} />
                <RelatedReposCard repoRefs={repoRefs} />
              </aside>
            )}
          </div>
        </article>
      )}

      {nip && (
        <RevisionsDialog
          open={showRevisions}
          onOpenChange={setShowRevisions}
          target={{ kind: CUSTOM_NIP_KIND, pubkey: nip.author, identifier: nip.identifier }}
        />
      )}

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this NIP?</AlertDialogTitle>
            <AlertDialogDescription>
              This publishes a deletion request (NIP-09) for your NIP. Relays that honor it will remove the
              event, but copies may remain on relays that don't. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}

export default CustomNipPage;
