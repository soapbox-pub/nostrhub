import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { FolderGit2, Sparkles } from 'lucide-react';
import { UserAvatar } from '@/components/UserAvatar';
import { useAuthor } from '@/hooks/useAuthor';
import { shortNpub } from '@/lib/nostr';
import { repoNaddr, type GitRepoAnnouncement } from '@/lib/git';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

/** Discovery card for a NIP-34 repository announcement, linking to its naddr route. */
export function RepoCard({ repo }: { repo: GitRepoAnnouncement }) {
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

/** Loading placeholder matching the RepoCard layout. */
export function RepoCardSkeleton() {
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

export default RepoCard;
