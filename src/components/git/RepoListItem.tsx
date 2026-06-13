import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { Sparkles } from 'lucide-react';
import { nip19 } from 'nostr-tools';
import { UserAvatar } from '@/components/UserAvatar';
import { useAuthor } from '@/hooks/useAuthor';
import { shortNpub } from '@/lib/nostr';
import { repoNaddr, isShakespeareRepo, type GitRepoAnnouncement } from '@/lib/git';
import { EditWithShakespeareButton } from '@/components/git/EditWithShakespeareButton';
import { Badge } from '@/components/ui/badge';
import { TagBadge } from '@/components/TagBadge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

/** Card-backed container for `RepoListItem` rows, with dividers between rows. */
export function RepoList({ children }: { children: React.ReactNode }) {
  return (
    <Card className="border-border/70 bg-card/60 py-2 backdrop-blur-sm">
      <CardContent className="divide-y divide-border/60 px-5">{children}</CardContent>
    </Card>
  );
}

interface RepoListItemProps {
  repo: GitRepoAnnouncement;
  /** Show the author avatar/name in the meta row (hide on profile pages). */
  showAuthor?: boolean;
}

/**
 * GitHub/GitLab-style repository list row: prominent name link, description,
 * topic badges, and a muted meta line. Render inside a `divide-y` container.
 */
export function RepoListItem({ repo, showAuthor = true }: RepoListItemProps) {
  const author = useAuthor(showAuthor ? repo.pubkey : undefined);
  const metadata = author.data?.metadata;
  const authorName = metadata?.name || metadata?.display_name || shortNpub(repo.pubkey);
  const naddr = repoNaddr(repo.pubkey, repo.identifier, repo.relays);
  const authorNpub = (() => {
    try {
      return nip19.npubEncode(repo.pubkey);
    } catch {
      return repo.pubkey;
    }
  })();

  return (
    <div className="flex flex-col gap-2 py-5 first:pt-3 last:pb-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Link
          to={`/${naddr}`}
          className="font-display text-lg font-semibold leading-tight text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
        >
          {repo.name}
        </Link>
        {repo.name !== repo.identifier && (
          <span className="truncate font-mono text-xs text-muted-foreground">{repo.identifier}</span>
        )}
        {repo.graspServers.length > 0 && (
          <Badge variant="outline" className="gap-1 text-xs font-normal text-nebula border-nebula/40">
            <Sparkles className="size-3" aria-hidden="true" /> GRASP
          </Badge>
        )}
      </div>

      {repo.description && (
        <p className="line-clamp-2 max-w-prose text-sm leading-relaxed text-muted-foreground">
          {repo.description}
        </p>
      )}

      {repo.hashtags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {repo.hashtags.slice(0, 5).map((tag) => (
            <TagBadge key={tag} tag={tag} to="repos" className="h-5 px-1.5 text-[11px]" />
          ))}
        </div>
      )}

      {isShakespeareRepo(repo) && (
        <div className="pt-0.5">
          <EditWithShakespeareButton repo={repo} variant="chip" />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        {showAuthor && (
          <>
            <Link
              to={`/${authorNpub}`}
              className="flex min-w-0 items-center gap-1.5 font-medium text-foreground/80 hover:text-primary"
            >
              <UserAvatar pubkey={repo.pubkey} size="sm" />
              <span className="truncate">{authorName}</span>
            </Link>
            <span aria-hidden="true">·</span>
          </>
        )}
        <span>
          Updated {formatDistanceToNow(new Date(repo.createdAt * 1000), { addSuffix: true })}
        </span>
      </div>
    </div>
  );
}

/** Loading placeholder matching the RepoListItem layout. */
export function RepoListItemSkeleton() {
  return (
    <div className="space-y-2.5 py-5 first:pt-3 last:pb-3">
      <Skeleton className="h-5 w-48" />
      <Skeleton className="h-4 w-full max-w-prose" />
      <Skeleton className="h-4 w-2/3 max-w-prose" />
      <div className="flex items-center gap-2 pt-0.5">
        <Skeleton className="size-6 rounded-full" />
        <Skeleton className="h-3 w-32" />
      </div>
    </div>
  );
}

export default RepoListItem;
