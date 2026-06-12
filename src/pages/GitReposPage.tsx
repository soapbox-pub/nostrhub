import { useMemo, useState } from 'react';
import { useSeoMeta } from '@unhead/react';
import { useSearchParams } from 'react-router-dom';
import { nip19 } from 'nostr-tools';
import { Search, User, X } from 'lucide-react';
import { Layout } from '@/components/Layout';
import { RepoCard, RepoCardSkeleton } from '@/components/git/RepoCard';
import { useGitRepos } from '@/hooks/useGitRepos';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAuthor } from '@/hooks/useAuthor';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/** Resolve an `author` query param (npub, nprofile, or hex) to a hex pubkey. */
function authorParamToHex(value: string | null): string | undefined {
  if (!value) return undefined;
  if (/^[0-9a-f]{64}$/i.test(value)) return value.toLowerCase();
  try {
    const decoded = nip19.decode(value);
    if (decoded.type === 'npub') return decoded.data;
    if (decoded.type === 'nprofile') return decoded.data.pubkey;
  } catch {
    // fall through
  }
  return undefined;
}

/** Discovery page for NIP-34 git repositories announced on Nostr. */
export function GitReposPage() {
  const { user } = useCurrentUser();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [activeTag, setActiveTag] = useState<string>();

  // `/repos?author=<npub|nprofile|hex>` filters to one author's announcements.
  const authorHex = useMemo(
    () => authorParamToHex(searchParams.get('author')),
    [searchParams],
  );
  const mine = Boolean(user) && authorHex === user!.pubkey;
  const filteredAuthor = useAuthor(mine ? undefined : authorHex);

  const { data: repos, isLoading } = useGitRepos(
    authorHex ? { authors: [authorHex], limit: 200 } : {},
  );

  const setAuthor = (pubkey?: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (pubkey) next.set('author', nip19.npubEncode(pubkey));
      else next.delete('author');
      return next;
    }, { replace: true });
  };

  const authorLabel = mine
    ? 'Your repos'
    : filteredAuthor.data?.metadata?.name
      ?? (authorHex ? `${nip19.npubEncode(authorHex).slice(0, 12)}…` : '');

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
    <Layout>
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

          {(topTags.length > 0 || user || authorHex) && (
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter repositories">
              {user && (
                <button
                  type="button"
                  onClick={() => setAuthor(mine ? undefined : user.pubkey)}
                  aria-pressed={mine}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    mine
                      ? 'border-primary/40 bg-gradient-to-r from-primary/15 to-nebula/15 text-foreground'
                      : 'border-border/60 text-muted-foreground hover:border-primary/30 hover:text-foreground',
                  )}
                >
                  <User className="size-3" aria-hidden="true" />
                  Your repos
                  {mine && <X className="size-3" aria-hidden="true" />}
                </button>
              )}
              {authorHex && !mine && (
                <button
                  type="button"
                  onClick={() => setAuthor(undefined)}
                  aria-pressed="true"
                  aria-label={`Clear author filter: ${authorLabel}`}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full border border-primary/40 bg-gradient-to-r from-primary/15 to-nebula/15 px-2.5 py-1 text-xs font-medium text-foreground transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  )}
                >
                  <User className="size-3" aria-hidden="true" />
                  {authorLabel}
                  <X className="size-3" aria-hidden="true" />
                </button>
              )}
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
                {authorHex && (!repos || repos.length === 0)
                  ? mine
                    ? "You haven't announced any git repos on Nostr yet."
                    : "This author hasn't announced any git repos on Nostr yet."
                  : repos && repos.length > 0
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
