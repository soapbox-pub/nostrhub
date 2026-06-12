import { Link } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { nip19 } from 'nostr-tools';
import { formatDistanceToNow } from 'date-fns';
import {
  AlertCircle,
  Crown,
  ExternalLink,
  Fingerprint,
  FolderGit2,
  Globe,
  Radio,
  Users,
} from 'lucide-react';
import { Layout } from '@/components/Layout';
import { UserAvatar } from '@/components/UserAvatar';
import { CopyButton } from '@/components/git/CopyButton';
import { RepoFileBrowser } from '@/components/git/RepoFileBrowser';
import { CommentsSection } from '@/components/comments/CommentsSection';
import { UsedByAppsCard, RelatedNipsCard } from '@/components/CrossRefCards';
import { useGitRepo } from '@/hooks/useGitRepo';
import { useAuthor } from '@/hooks/useAuthor';
import { useAppsForRepo } from '@/hooks/useAppsForRepo';
import { shortNpub } from '@/lib/nostr';
import { GIT_REPO_KIND, type GitRepoAnnouncement } from '@/lib/git';
import { uniqueNipRefs } from '@/lib/apps';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';

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
  const npub = nip19.npubEncode(pubkey);

  return (
    <Link
      to={`/${npub}`}
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
            <ul className="space-y-1.5">
              {repo.relays.map((relay) => (
                <li key={relay} className="truncate font-mono text-xs text-muted-foreground" title={relay}>
                  {relay}
                </li>
              ))}
            </ul>
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
              Earliest unique commit — identifies this project across forks and mirrors.
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
  const repo = data?.repo ?? null;
  const state = data?.state ?? null;
  const repoAddress = `${GIT_REPO_KIND}:${pubkey}:${identifier}`;
  const appsForRepo = useAppsForRepo(repoAddress);

  // Apps referencing this repo in their NIP-89 listing also declare the NIPs
  // they implement — the listing is the nexus tying repos to NIPs.
  const nipRefs = uniqueNipRefs(appsForRepo.data ?? []);

  const authorName =
    author.data?.metadata?.name || author.data?.metadata?.display_name || shortNpub(pubkey);

  useSeoMeta({
    title: repo ? `${repo.name} | NostrHub` : 'Git repository | NostrHub',
    description:
      repo?.description ?? (repo ? `${repo.name} — a git repository announced on Nostr.` : undefined),
  });

  const updatedAt = repo
    ? Math.max(repo.createdAt, state?.createdAt ?? 0)
    : state?.createdAt;

  return (
    <Layout
      sidebar={repo ? (
        <>
          <UsedByAppsCard apps={appsForRepo.data ?? []} />
          <RelatedNipsCard nipRefs={nipRefs} />
          <RepoSidebar repo={repo} />
        </>
      ) : undefined}
    >
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
          <header className="space-y-4">
            <div className="flex items-start gap-4">
              <span
                className="grid size-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-primary/20 via-primary/10 to-nebula/20 ring-1 ring-primary/20 glow motion-safe:animate-[float-slow_6s_ease-in-out_infinite]"
                aria-hidden="true"
              >
                <FolderGit2 className="size-7 text-primary" />
              </span>
              <div className="min-w-0 space-y-1">
                <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
                  {repo.name}
                </h1>
                <p className="truncate font-mono text-sm text-muted-foreground">{identifier}</p>
              </div>
            </div>

            {repo.description && (
              <p className="max-w-prose text-lg leading-relaxed text-muted-foreground">
                {repo.description}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
              <Link
                to={`/${nip19.npubEncode(pubkey)}`}
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
            </div>

            {repo.hashtags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {repo.hashtags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="font-normal">
                    #{tag}
                  </Badge>
                ))}
              </div>
            )}

            {repo.webUrls.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {repo.webUrls.map((url) => (
                  <Button key={url} variant="outline" size="sm" asChild className="gap-1.5">
                    <a href={url} target="_blank" rel="noopener noreferrer">
                      <Globe className="size-4" aria-hidden="true" />
                      <span className="max-w-56 truncate">{new URL(url).hostname}</span>
                      <ExternalLink className="size-3 opacity-60" aria-hidden="true" />
                    </a>
                  </Button>
                ))}
              </div>
            )}
          </header>

          {/* ——— Files (clone, branches, and tags live in its header) ——— */}
          <RepoFileBrowser repo={repo} state={state} />

          {/* ——— Discussion ——— */}
          <section className="space-y-4">
            <h2 className="font-display text-xl font-semibold tracking-tight">Discussion</h2>
            <CommentsSection
              root={repo.event}
              communityFilter={false}
              emptyStateMessage="No discussion yet"
              emptyStateSubtitle="Questions, praise, bug reports — start the conversation."
            />
          </section>
        </article>
      )}
    </Layout>
  );
}

export default GitRepoPage;
