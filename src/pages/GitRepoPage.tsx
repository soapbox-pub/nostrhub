import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { formatDistanceToNow } from 'date-fns';
import {
  AlertCircle,
  Crown,
  Fingerprint,
  MoreVertical,
  Pencil,
  Radio,
  Trash2,
  Users,
} from 'lucide-react';
import { Layout } from '@/components/Layout';
import { BackLink, DetailHero, HeroExternalLink } from '@/components/DetailHero';
import { DetailSurface } from '@/components/DetailSurface';
import { UserAvatar } from '@/components/UserAvatar';
import { CopyButton } from '@/components/git/CopyButton';
import { EditWithShakespeareButton } from '@/components/git/EditWithShakespeareButton';
import { RepoFileBrowser } from '@/components/git/RepoFileBrowser';
import { CommentsSection } from '@/components/comments/CommentsSection';
import { UsedByAppsCard, RelatedNipsCard } from '@/components/CrossRefCards';
import { LinkAppNudge } from '@/components/LinkAppNudge';
import { useGitRepo, useDeleteRepo } from '@/hooks/useGitRepo';
import { useAuthor } from '@/hooks/useAuthor';
import { useProfileUrl } from '@/hooks/useProfileUrl';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useToast } from '@/hooks/useToast';
import { useAppsForRepo } from '@/hooks/useAppsForRepo';
import { shortNpub, formatRelayName } from '@/lib/nostr';
import { GIT_REPO_KIND, isShakespeareRepo, repoNaddr, type GitRepoAnnouncement } from '@/lib/git';
import { uniqueNipRefs } from '@/lib/apps';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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

interface GitRepoPageProps {
  /** Repository owner (hex pubkey). */
  pubkey: string;
  /** Repository `d` tag identifier. */
  identifier: string;
  /** Relay hints from the naddr. */
  relays?: string[];
}

/** A person row (owner or maintainer) linking to their profile. */
function PersonRow({ pubkey, owner = false }: { pubkey: string; owner?: boolean }) {
  const author = useAuthor(pubkey);
  const metadata = author.data?.metadata;
  const name = metadata?.name || metadata?.display_name || shortNpub(pubkey);
  const profileUrl = useProfileUrl(pubkey, metadata);

  return (
    <Link
      to={profileUrl}
      className="group flex items-center gap-2.5 rounded-lg px-2 py-1.5 -mx-2 transition-colors hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <UserAvatar pubkey={pubkey} size="sm" />
      <span className="min-w-0 truncate text-sm font-medium group-hover:text-primary">{name}</span>
      {owner && (
        <span className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Crown className="size-3 text-chart-3" aria-hidden="true" /> owner
        </span>
      )}
    </Link>
  );
}

function RepoSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4">
        <Skeleton className="size-14 rounded-2xl" />
        <div className="flex-1 space-y-3">
          <Skeleton className="h-9 w-2/3" />
          <Skeleton className="h-5 w-1/2" />
        </div>
      </div>
      <Skeleton className="h-40 w-full rounded-xl" />
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}

function RepoSidebar({ repo }: { repo: GitRepoAnnouncement }) {
  return (
    <>
      <Card className="gap-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            <Users className="size-4" aria-hidden="true" /> Maintainers
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-0.5">
          <PersonRow pubkey={repo.pubkey} owner />
          {repo.maintainers.map((pk) => (
            <PersonRow key={pk} pubkey={pk} />
          ))}
        </CardContent>
      </Card>

      {repo.relays.length > 0 && (
        <Card className="gap-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              <Radio className="size-4" aria-hidden="true" /> Repository relays
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1.5">
              {repo.relays.map((relay) => (
                <Badge
                  key={relay}
                  variant="secondary"
                  className="max-w-full truncate font-mono text-xs font-normal"
                  title={relay}
                >
                  {formatRelayName(relay)}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {repo.earliestCommit && (
        <Card className="gap-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              <Fingerprint className="size-4" aria-hidden="true" /> Repository fingerprint
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-1">
              <code
                className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground"
                title={repo.earliestCommit}
              >
                {repo.earliestCommit}
              </code>
              <CopyButton value={repo.earliestCommit} label="Copy earliest unique commit id" />
            </div>
            <p className="mt-2 text-xs text-muted-foreground/80">
              Earliest unique commit. Identifies this project across forks and mirrors.
            </p>
          </CardContent>
        </Card>
      )}
    </>
  );
}

/**
 * Repository detail view for NIP-34 git announcements (kind 30617), enriched
 * with branch/tag state from kind 30618. Routed via `/:naddr`.
 */
export function GitRepoPage({ pubkey, identifier, relays }: GitRepoPageProps) {
  const { data, isLoading, isError } = useGitRepo({ pubkey, identifier, relays });
  const author = useAuthor(pubkey);
  const authorUrl = useProfileUrl(pubkey, author.data?.metadata);
  const { user } = useCurrentUser();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { mutateAsync: deleteRepo, isPending: isDeleting } = useDeleteRepo();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const repo = data?.repo ?? null;
  const state = data?.state ?? null;
  const repoAddress = `${GIT_REPO_KIND}:${pubkey}:${identifier}`;
  const appsForRepo = useAppsForRepo(repoAddress);

  const isOwner = !!user && !!repo && user.pubkey === repo.pubkey;
  const editNaddr = repoNaddr(pubkey, identifier, relays);

  const handleDelete = async () => {
    if (!repo) return;
    try {
      await deleteRepo({ repo, state });
      toast({ title: 'Repository deleted' });
      setShowDeleteDialog(false);
      navigate('/repos');
    } catch (error) {
      toast({
        title: 'Failed to delete repository',
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      });
    }
  };

  // Apps referencing this repo in their NIP-89 listing also declare the NIPs
  // they implement — the listing is the nexus tying repos to NIPs.
  const nipRefs = uniqueNipRefs(appsForRepo.data ?? []);

  const authorName =
    author.data?.metadata?.name || author.data?.metadata?.display_name || shortNpub(pubkey);

  useSeoMeta({
    title: repo ? `${repo.name} | NostrHub` : 'Git repository | NostrHub',
    description:
      repo?.description ?? (repo ? `${repo.name}: a git repository announced on Nostr.` : undefined),
  });

  const updatedAt = repo
    ? Math.max(repo.createdAt, state?.createdAt ?? 0)
    : state?.createdAt;

  return (
    <Layout className="max-w-6xl">
      <BackLink to="/repos">Back to Repositories</BackLink>

      {isLoading ? (
        <RepoSkeleton />
      ) : isError || !repo ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertDescription>
            Could not find this repository. Its announcement may not have reached your relays yet.
          </AlertDescription>
        </Alert>
      ) : (
        <article className="space-y-8">
          {/* ——— Header ——— */}
          <DetailSurface className="relative">
          {isOwner && (
            <div className="absolute right-4 top-4 sm:right-6 sm:top-6">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 text-muted-foreground hover:text-foreground"
                    aria-label="Repository options"
                  >
                    <MoreVertical className="size-4" aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild>
                    <Link to={`/repos/edit/${editNaddr}`}>
                      <Pencil className="size-4" aria-hidden="true" /> Edit
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={(e) => {
                      e.preventDefault();
                      setShowDeleteDialog(true);
                    }}
                  >
                    <Trash2 className="size-4" aria-hidden="true" /> Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
          <DetailHero
            title={repo.name}
            subtitle={
              repo.name.toLowerCase() !== repo.identifier.toLowerCase() ? (
                <span className="block truncate font-mono">{repo.identifier}</span>
              ) : undefined
            }
            description={repo.description}
            meta={
              <>
                <Link
                  to={authorUrl}
                  className="flex items-center gap-2 hover:text-primary"
                >
                  <UserAvatar pubkey={pubkey} size="sm" />
                  <span className="font-medium text-foreground">{authorName}</span>
                </Link>
                {updatedAt ? (
                  <span>
                    updated {formatDistanceToNow(new Date(updatedAt * 1000), { addSuffix: true })}
                  </span>
                ) : null}
              </>
            }
            actions={
              isShakespeareRepo(repo) || repo.webUrls.length > 0 ? (
                <>
                  {isShakespeareRepo(repo) && <EditWithShakespeareButton repo={repo} />}
                  {repo.webUrls.map((url) => (
                    <HeroExternalLink key={url} href={url}>
                      Open App
                    </HeroExternalLink>
                  ))}
                </>
              ) : undefined
            }
          />
          </DetailSurface>

          {/* Below the hero: files + discussion on the left, repo metadata and
              NIP-89 cross-references on the right. */}
          <div className="space-y-8 lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-8 lg:space-y-0">
            <div className="min-w-0 space-y-8">
              {/* ——— Files (clone, branches, and tags live in its header) ——— */}
              <RepoFileBrowser repo={repo} state={state} />

              {/* ——— Discussion ——— */}
              <DetailSurface as="section" className="space-y-4">
                <h2 className="font-display text-xl font-semibold tracking-tight">Discussion</h2>
                <CommentsSection
                  root={repo.event}
                  emptyStateMessage="No discussion yet"
                  emptyStateSubtitle="Questions, praise, bug reports. Start the conversation."
                />
              </DetailSurface>
            </div>

            <aside aria-label="Repository details" className="space-y-4 lg:sticky lg:top-24">
              <LinkAppNudge
                target={{
                  kind: 'repo',
                  address: repoAddress,
                  ownerPubkey: pubkey,
                  relayHint: repo.relays[0],
                  label: repo.name,
                }}
                linkedApps={appsForRepo.data ?? []}
              />
              <UsedByAppsCard apps={appsForRepo.data ?? []} />
              <RelatedNipsCard nipRefs={nipRefs} />
              <RepoSidebar repo={repo} />
            </aside>
          </div>
        </article>
      )}

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this repository?</AlertDialogTitle>
            <AlertDialogDescription>
              This publishes a deletion request (NIP-09) for your repository announcement. Relays
              that honor it will remove the event, but copies may remain on relays that don't, and
              any git data already pushed to a hosting server is unaffected. This can't be undone.
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

export default GitRepoPage;
