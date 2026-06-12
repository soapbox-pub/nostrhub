import { Heart } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppLikes } from '@/hooks/useAppLikes';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import type { AppInfo } from '@/lib/apps';

interface AppLikeButtonProps {
  app: AppInfo;
  className?: string;
}

/**
 * Heart reaction button for a NIP-89 app listing.
 * Publishes a kind-7 reaction (NIP-25) targeting the app's addressable event.
 * Shows the aggregate like count and fills when the current user has liked it.
 */
export function AppLikeButton({ app, className }: AppLikeButtonProps) {
  const { user } = useCurrentUser();
  const { likeCount, likedByMe, like, isPending } = useAppLikes(app);

  function handleClick(e: React.MouseEvent) {
    e.preventDefault(); // don't follow the parent Link
    e.stopPropagation();
    if (!user || likedByMe || isPending) return;
    like();
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={!user || likedByMe || isPending}
      aria-label={likedByMe ? `Liked (${likeCount})` : `Like this app (${likeCount} likes)`}
      aria-pressed={likedByMe}
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        likedByMe
          ? 'text-rose-500'
          : 'text-muted-foreground hover:text-rose-500',
        (!user || likedByMe) && 'cursor-default',
        className,
      )}
    >
      <Heart
        className={cn('size-3.5 transition-all', likedByMe && 'fill-rose-500')}
        aria-hidden="true"
      />
      {likeCount > 0 && <span>{likeCount}</span>}
    </button>
  );
}
