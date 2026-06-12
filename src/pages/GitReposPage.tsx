import { useMemo, useState } from 'react';
import { useSeoMeta } from '@unhead/react';
import { useSearchParams } from 'react-router-dom';
import { nip19 } from 'nostr-tools';
import { User, X } from 'lucide-react';
import { RepoCard, RepoCardSkeleton } from '@/components/git/RepoCard';
import {
  DiscoveryGrid,
  DiscoveryPage,
  DiscoverySearch,
  FilterPill,
} from '@/components/DiscoveryGrid';
import { useGitRepos } from '@/hooks/useGitRepos';
import { useCommunityAuthors } from '@/hooks/useCommunityAuthors';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAuthor } from '@/hooks/useAuthor';

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

  // The web-of-trust author set (the ~1000 community pubkeys derived from the
  // experts' follows). All discovery queries are constrained to this set for
  // spam resistance; a specific `?author=` filter takes precedence over it.
  const community = useCommunityAuthors();
  const communityAuthors = community.data?.authors;

  const { data: repos, isLoading } = useGitRepos(
    authorHex
      ? { authors: [authorHex], limit: 200 }
      : { authors: communityAuthors, limit: 200, enabled: communityAuthors !== undefined },
  );

  // While the community author set is still resolving (and no explicit author
  // is requested), the repo query is disabled — surface the loading skeleton.
  const loading = isLoading || (!authorHex && communityAuthors === undefined);

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
    description: 'Discover git repositories announced on Nostr. Clone them over relays, no forge required.',
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
    <DiscoveryPage
      title="Repositories"
      description="Code that lives on Nostr: announced over relays, cloneable from anywhere, owned by no forge."
      filters={
        <>
          <DiscoverySearch
            label="Search repositories"
            placeholder="Search repositories…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          {(topTags.length > 0 || user || authorHex) && (
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter repositories">
              {user && (
                <FilterPill active={mine} onClick={() => setAuthor(mine ? undefined : user.pubkey)}>
                  <User className="size-3" aria-hidden="true" />
                  Your repos
                  {mine && <X className="size-3" aria-hidden="true" />}
                </FilterPill>
              )}
              {authorHex && !mine && (
                <FilterPill
                  active
                  onClick={() => setAuthor(undefined)}
                  aria-label={`Clear author filter: ${authorLabel}`}
                >
                  <User className="size-3" aria-hidden="true" />
                  {authorLabel}
                  <X className="size-3" aria-hidden="true" />
                </FilterPill>
              )}
              {topTags.map((tag) => {
                const active = tag === activeTag;
                return (
                  <FilterPill
                    key={tag}
                    active={active}
                    onClick={() => setActiveTag(active ? undefined : tag)}
                  >
                    #{tag}
                    {active && <X className="size-3" aria-hidden="true" />}
                  </FilterPill>
                );
              })}
            </div>
          )}
        </>
      }
    >
      <DiscoveryGrid
        items={filtered}
        isLoading={loading}
        getKey={(repo) => `${repo.pubkey}:${repo.identifier}`}
        renderItem={(repo) => <RepoCard repo={repo} />}
        renderSkeleton={() => <RepoCardSkeleton />}
        empty={
          authorHex && (!repos || repos.length === 0)
            ? mine
              ? "You haven't announced any git repos on Nostr yet."
              : "This author hasn't announced any git repos on Nostr yet."
            : repos && repos.length > 0
              ? 'No repositories match your search.'
              : 'No repositories found. Try checking your relay connections or wait a moment for content to load.'
        }
      />
    </DiscoveryPage>
  );
}

export default GitReposPage;
