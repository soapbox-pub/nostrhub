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
  GitBranch,
  Globe,
  Link2,
  Radio,
  Sparkles,
  Tag,
  Users,
} from 'lucide-react';
import { Layout } from '@/components/Layout';
import { UserAvatar } from '@/components/UserAvatar';
import { CopyButton } from '@/components/git/CopyButton';
import { RepoFileBrowser } from '@/components/git/RepoFileBrowser';
import { CommentsSection } from '@/components/comments/CommentsSection';
import { useGitRepo } from '@/hooks/useGitRepo';
import { useAuthor } from '@/hooks/useAuthor';
import { shortNpub } from '@/lib/nostr';
import { nostrCloneUri, shortCommit, type GitRef, type GitRepoAnnouncement } from '@/lib/git';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';

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

/** A mono code row with a copy button — the clone-command staple. */
function CopyRow({
  value,
  display,
  label,
  prominent = false,
}: {
  value: string;
  display?: string;
  label: string;
  prominent?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-lg border px-3 py-2',
        prominent
          ? 'border-primary/25 bg-gradient-to-r from-primary/[0.07] to-nebula/[0.07]'
          : 'border-border/60 bg-muted/50',
      )}
    >
      <code className="min-w-0 flex-1 truncate font-mono text-[13px]" title={value}>
        {display ?? value}
      </code>
      <CopyButton value={value} label={label} />
    </div>
  );
}

/** One ref (branch or tag) with its short commit id. */
function RefRow({ refItem, isDefault = false }: { refItem: GitRef; isDefault?: boolean }) {
  return (
    <li className="flex items-center gap-2 py-1.5">
      <span className="min-w-0 truncate font-mono text-sm" title={refItem.name}>
        {refItem.name}
      </span>
      {isDefault && (
        <Badge variant="secondary" className="h-5 px-1.5 text-[10px] uppercase tracking-wide">
          default
        </Badge>
      )}
      <span className="ml-auto flex items-center gap-1">
        <code className="font-mono text-xs text-muted-foreground" title={refItem.commit}>
          {shortCommit(refItem.commit)}
        </code>
        <CopyButton value={refItem.commit} label={`Copy commit id for ${refItem.name}`} />
      </span>
    </li>
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
      <Card>
        <CardHeader className="pb-3">
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
        <Card>
          <CardHeader className="pb-3">
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
        <Card>
          <CardHeader className="pb-3">
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

  const authorName =
    author.data?.metadata?.name || author.data?.metadata?.display_name || shortNpub(pubkey);

  useSeoMeta({
    title: repo ? `${repo.name} | NostrHub` : 'Git repository | NostrHub',
    description:
      repo?.description ?? (repo ? `${repo.name} — a git repository announced on Nostr.` : undefined),
  });

  const cloneUri = nostrCloneUri(pubkey, identifier);
  const defaultBranch = state?.headBranch
    ? state.branches.find((b) => b.name === state.headBranch)
    : undefined;
  const updatedAt = repo
    ? Math.max(repo.createdAt, state?.createdAt ?? 0)
    : state?.createdAt;

  return (
    <Layout sidebar={repo ? <RepoSidebar repo={repo} /> : undefined}>
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
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
                    {repo.name}
                  </h1>
                  {defaultBranch && (
                    <Badge variant="outline" className="gap-1 font-mono text-xs">
                      <GitBranch className="size-3" aria-hidden="true" />
                      {defaultBranch.name}
                    </Badge>
                  )}
                </div>
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

          {/* ——— Clone ——— */}
          <Card className="overflow-hidden">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-base">
                <Link2 className="size-4 text-primary" aria-hidden="true" /> Clone this repository
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <Sparkles className="size-3.5 text-nebula" aria-hidden="true" /> Over Nostr
                  <span className="font-normal normal-case tracking-normal">
                    — with{' '}
                    <a
                      href="https://gitworkshop.dev/ngit"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline decoration-dotted underline-offset-2 hover:text-foreground"
                    >
                      ngit
                    </a>{' '}
                    installed
                  </span>
                </p>
                <CopyRow
                  value={`git clone ${cloneUri}`}
                  display={`git clone ${cloneUri}`}
                  label="Copy nostr clone command"
                  prominent
                />
              </div>

              {repo.cloneUrls.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Over HTTPS
                  </p>
                  <div className="space-y-2">
                    {repo.cloneUrls.map((url) => {
                      const hostname = new URL(url).hostname;
                      const isGrasp = repo.graspServers.includes(hostname);
                      return (
                        <div key={url} className="flex items-center gap-2">
                          <CopyRow value={url} label={`Copy clone URL for ${hostname}`} />
                          {isGrasp && (
                            <Badge
                              variant="outline"
                              className="hidden h-6 shrink-0 gap-1 border-nebula/40 text-nebula sm:inline-flex"
                              title="GRASP server: a Nostr relay that also hosts the git objects"
                            >
                              <Sparkles className="size-3" aria-hidden="true" /> GRASP
                            </Badge>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ——— Files ——— */}
          <RepoFileBrowser repo={repo} state={state} />

          {/* ——— Branches & tags ——— */}
          {state && (state.branches.length > 0 || state.tags.length > 0) ? (
            <div className="grid gap-6 sm:grid-cols-2">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <GitBranch className="size-4 text-primary" aria-hidden="true" />
                    Branches
                    <span className="text-sm font-normal text-muted-foreground">
                      {state.branches.length}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {state.branches.length > 0 ? (
                    <ul className="divide-y divide-border/60">
                      {state.branches.map((branch) => (
                        <RefRow
                          key={branch.name}
                          refItem={branch}
                          isDefault={branch.name === state.headBranch}
                        />
                      ))}
                    </ul>
                  ) : (
                    <p className="py-2 text-sm text-muted-foreground">No branches announced.</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Tag className="size-4 text-nebula" aria-hidden="true" />
                    Tags
                    <span className="text-sm font-normal text-muted-foreground">
                      {state.tags.length}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {state.tags.length > 0 ? (
                    <ul className="divide-y divide-border/60">
                      {state.tags.map((tag) => (
                        <RefRow key={tag.name} refItem={tag} />
                      ))}
                    </ul>
                  ) : (
                    <p className="py-2 text-sm text-muted-foreground">No releases yet.</p>
                  )}
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card className="border-dashed">
              <CardContent className="px-8 py-10 text-center">
                <p className="mx-auto max-w-sm text-muted-foreground">
                  No state announcement found — branches and tags for this repository are not being
                  tracked on Nostr.
                </p>
              </CardContent>
            </Card>
          )}

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
