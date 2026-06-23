import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { useAuthor } from '@/hooks/useAuthor';
import { useProfileUrl } from '@/hooks/useProfileUrl';
import { useRepoUrl } from '@/hooks/useRepoUrl';
import { UserAvatar } from '@/components/UserAvatar';
import { shortNpub } from '@/lib/nostr';
import { isShakespeareRepo, type GitRepoAnnouncement } from '@/lib/git';
import { EditWithShakespeareButton } from '@/components/git/EditWithShakespeareButton';
import { CloneUriPill } from '@/components/git/CloneUriPill';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

/** Card view for a NIP-34 git repository announcement (kind 30617). */
export function RepoCard({ repo }: { repo: GitRepoAnnouncement }) {
  const author = useAuthor(repo.pubkey);
  const metadata = author.data?.metadata;
  const authorName = metadata?.name || metadata?.display_name || shortNpub(repo.pubkey);
  const nip05 = metadata?.nip05;
  const repoUrl = useRepoUrl(repo.pubkey, repo.identifier);
  const authorUrl = useProfileUrl(repo.pubkey, metadata);

  return (
    <Card className="group relative h-full overflow-clip border-border/70 bg-card/60 backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-[0_8px_40px_-8px] hover:shadow-primary/30">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-8 -top-10 size-32 rounded-full bg-primary/20 opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-100"
      />
      <Link
        to={repoUrl}
        className="relative block h-full rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <CardContent className="flex h-full flex-col gap-3 px-4">
          {/* Header: name */}
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1 space-y-0.5">
              <h3 className="truncate font-semibold leading-snug tracking-tight group-hover:text-primary">
                {repo.name}
              </h3>
            </div>
          </div>

          {/* Description */}
          {repo.description && (
            <p className="line-clamp-2 flex-1 text-sm text-muted-foreground">{repo.description}</p>
          )}

          {/* Actions: copyable clone URI + optional Shakespeare edit */}
          <div className="flex flex-wrap items-center gap-2">
            <CloneUriPill repo={repo} className="max-w-full flex-1 basis-48" />
            {isShakespeareRepo(repo) && (
              <EditWithShakespeareButton repo={repo} variant="chip" />
            )}
          </div>

          {/* Author + timestamp */}
          <div className="mt-auto flex items-center gap-2 border-t border-border/50 pt-3">
            <Link
              to={authorUrl}
              onClick={(e) => e.stopPropagation()}
              className="flex min-w-0 items-center gap-1.5 text-xs text-foreground/80 hover:text-primary"
            >
              <UserAvatar pubkey={repo.pubkey} size="sm" />
              <span className="truncate">{nip05 ?? authorName}</span>
            </Link>
            <span className="ml-auto shrink-0 text-xs text-muted-foreground/60">
              {formatDistanceToNow(new Date(repo.createdAt * 1000), { addSuffix: true })}
            </span>
          </div>
        </CardContent>
      </Link>
    </Card>
  );
}

export function RepoCardSkeleton() {
  return (
    <Card>
      <CardContent className="space-y-3 px-4">
        <div className="flex items-start gap-3">
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <div className="flex items-center gap-2 pt-1">
          <Skeleton className="size-6 rounded-full" />
          <Skeleton className="h-3 w-28" />
          <Skeleton className="ml-auto h-3 w-16" />
        </div>
      </CardContent>
    </Card>
  );
}

export default RepoCard;
