import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { formatDistanceToNow } from 'date-fns';
import { FolderGit2, Search, Sparkles, X } from 'lucide-react';
import { Layout } from '@/components/Layout';
import { UserAvatar } from '@/components/UserAvatar';
import { useGitRepos } from '@/hooks/useGitRepos';
import { useAuthor } from '@/hooks/useAuthor';
import { shortNpub } from '@/lib/nostr';
import { repoNaddr, type GitRepoAnnouncement } from '@/lib/git';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

function RepoCard({ repo }: { repo: GitRepoAnnouncement }) {
  const author = useAuthor(repo.pubkey);
  const metadata = author.data?.metadata;
  const authorName = metadata?.name || metadata?.display_name || shortNpub(repo.pubkey);
  const naddr = repoNaddr(repo.pubkey, repo.identifier, repo.relays);

  return (
    <Link
      to={`/${naddr}`}
      className="group block h-full rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Card className="h-full transition-all duration-300 group-hover:-translate-y-0.5 group-hover:border-primary/30 group-hover:glow">
        <CardContent className="flex h-full flex-col gap-3 p-5">
          <div className="flex items-start gap-3">
            <span
              className="grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary/15 to-nebula/15 ring-1 ring-primary/15"
              aria-hidden="true"
            >
              <FolderGit2 className="size-5 text-primary" />
            </span>
            <div className="min-w-0">
              <h3 className="truncate font-display font-semibold leading-tight group-hover:text-primary">
                {repo.name}
              </h3>
              <p className="truncate font-mono text-xs text-muted-foreground">{repo.identifier}</p>
            </div>
            {repo.graspServers.length > 0 && (
              <Sparkles
                className="ml-auto size-4 shrink-0 text-nebula"
                aria-label="Hosted on a GRASP server"
              />
            )}
          </div>

          {repo.description && (
            <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">
              {repo.description}
            </p>
          )}

          {repo.hashtags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {repo.hashtags.slice(0, 3).map((tag) => (
                <Badge key={tag} variant="secondary" className="h-5 px-1.5 text-[11px] font-normal">
                  #{tag}
                </Badge>
              ))}
            </div>
          )}

          <div className="mt-auto flex items-center gap-2 pt-1 text-xs text-muted-foreground">
            <UserAvatar pubkey={repo.pubkey} size="sm" />
            <span className="min-w-0 truncate font-medium text-foreground/80">{authorName}</span>
            <span className="ml-auto shrink-0">
              {formatDistanceToNow(new Date(repo.createdAt * 1000), { addSuffix: true })}
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function RepoCardSkeleton() {
  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <div className="flex items-start gap-3">
          <Skeleton className="size-10 rounded-xl" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <div className="flex items-center gap-2 pt-1">
          <Skeleton className="size-6 rounded-full" />
          <Skeleton className="h-3 w-24" />
        </div>
      </CardContent>
    </Card>
  );
}

/** Discovery page for NIP-34 git repositories announced on Nostr. */
export function GitReposPage() {
  const { data: repos, isLoading } = useGitRepos();
  const [search, setSearch] = useState('');
  const [activeTag, setActiveTag] = useState<string>();

  useSeoMeta({
    title: 'Repositories | NostrHub',
    description: 'Discover git repositories announced on Nostr — clone them over relays, no forge required.',
  });

  // The most common hashtags across loaded repos, for one-tap filtering.
  const topTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const repo of repos ?? []) {
      for (const tag of repo.hashtags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([tag]) => tag);
  }, [repos]);

  const filtered = useMemo(() => {
    if (!repos) return [];
    const q = search.trim().toLowerCase();
    return repos.filter((repo) => {
      if (activeTag && !repo.hashtags.includes(activeTag)) return false;
      if (!q) return true;
      return (
        repo.name.toLowerCase().includes(q) ||
        repo.identifier.toLowerCase().includes(q) ||
        (repo.description?.toLowerCase().includes(q) ?? false) ||
        repo.hashtags.some((tag) => tag.includes(q))
      );
    });
  }, [repos, search, activeTag]);

  return (
    <Layout className="max-w-6xl">
      <div className="space-y-8">
        <header className="space-y-3">
          <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
            <span className="text-cosmic">Repositories</span>
          </h1>
          <p className="max-w-prose text-lg text-muted-foreground">
            Code that lives on Nostr — announced over relays, cloneable from anywhere, owned by no
            forge.
          </p>
        </header>

        <div className="space-y-3">
          <div className="relative max-w-md">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search repositories…"
              aria-label="Search repositories"
              className="pl-9"
            />
          </div>

          {topTags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by tag">
              {topTags.map((tag) => {
                const active = tag === activeTag;
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setActiveTag(active ? undefined : tag)}
                    aria-pressed={active}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      active
                        ? 'border-primary/40 bg-gradient-to-r from-primary/15 to-nebula/15 text-foreground'
                        : 'border-border/60 text-muted-foreground hover:border-primary/30 hover:text-foreground',
                    )}
                  >
                    #{tag}
                    {active && <X className="size-3" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <RepoCardSkeleton key={i} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="px-8 py-12 text-center">
              <p className="mx-auto max-w-sm text-muted-foreground">
                {repos && repos.length > 0
                  ? 'No repositories match your search.'
                  : 'No repositories found. Try checking your relay connections or wait a moment for content to load.'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((repo) => (
              <RepoCard key={`${repo.pubkey}:${repo.identifier}`} repo={repo} />
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}

export default GitReposPage;
