import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { nip19 } from 'nostr-tools';
import { GitFork, AlertCircle, Pencil, Trash2 } from 'lucide-react';
import { Layout } from '@/components/Layout';
import { BackLink, DetailHero } from '@/components/DetailHero';
import { DetailSurface } from '@/components/DetailSurface';
import { MarkdownContent } from '@/components/MarkdownContent';
import { ApproveButton } from '@/components/ApproveButton';
import { ExpertApprovers } from '@/components/ExpertApprovers';
import { CommentsSection } from '@/components/comments/CommentsSection';
import { UserAvatar } from '@/components/UserAvatar';
import { RelatedReposCard, UsedByAppsCard } from '@/components/CrossRefCards';
import { LinkAppNudge } from '@/components/LinkAppNudge';
import { useCustomNip } from '@/hooks/useCustomNips';
import { useDeleteNip } from '@/hooks/useSaveNip';
import { useAuthor } from '@/hooks/useAuthor';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useToast } from '@/hooks/useToast';
import { useAppsForCustomNip } from '@/hooks/useAppsForNip';
import { shortNpub } from '@/lib/nostr';
import { uniqueRepoRefs } from '@/lib/apps';
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

/** Detail view for a community-authored NIP (kind 30817), routed via its naddr. */
export function CustomNipPage({ naddr }: { naddr: string }) {
  const { data: nip, isLoading, isError } = useCustomNip(naddr);
  const { user } = useCurrentUser();
  const author = useAuthor(nip?.author);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { mutateAsync: deleteNip, isPending: isDeleting } = useDeleteNip();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const authorName =
    author.data?.metadata?.name || author.data?.metadata?.display_name || (nip ? shortNpub(nip.author) : '');
  const appsForNip = useAppsForCustomNip(nip?.address);

  // The NIP-89 listing is the nexus: apps point at both this NIP and the
  // repos implementing it, giving us related repos by association.
  const apps = appsForNip.data ?? [];
  const repoRefs = uniqueRepoRefs(apps);

  useSeoMeta({
    title: nip ? `${nip.title} | NostrHub` : 'NIP | NostrHub',
    description: nip ? `${nip.title}: a community NIP on NostrHub.` : undefined,
  });

  const target: NipTarget | null = nip ? { type: 'custom', address: nip.address } : null;
  const isOwner = !!user && !!nip && user.pubkey === nip.author;
  const showSidebar = apps.length > 0 || isOwner;

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
      <BackLink to="/">Back to NIPs</BackLink>

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
            {nip.fork && (
              <p className="text-sm text-muted-foreground">
                Forked from{' '}
                {nip.fork.type === 'official' ? (
                  <a href={nip.fork.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                    an official NIP
                  </a>
                ) : (
                  <span className="font-mono">{nip.fork.address}</span>
                )}
              </p>
            )}
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
            <DetailSurface className="min-w-0">
              <MarkdownContent content={nip.content} />

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
                <UsedByAppsCard apps={apps} />
                <RelatedReposCard repoRefs={repoRefs} />
              </aside>
            )}
          </div>
        </article>
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
