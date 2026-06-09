import { useComments } from '@/hooks/useComments';
import { useCommunityAuthors } from '@/hooks/useCommunityAuthors';
import { Skeleton } from '@/components/ui/skeleton';
import { MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { NostrEvent } from '@nostrify/nostrify';
import { CommentForm } from './CommentForm';
import { Comment } from './Comment';

interface CommentsSectionProps {
  root: NostrEvent | URL | `#${string}`;
  emptyStateMessage?: string;
  emptyStateSubtitle?: string;
  className?: string;
  limit?: number;
  /**
   * Restrict displayed comments to the community author set for spam resistance.
   * Defaults to true. Set false to show all authors.
   */
  communityFilter?: boolean;
}

export function CommentsSection({
  root,
  emptyStateMessage = 'No comments yet',
  emptyStateSubtitle = 'Be the first to share your thoughts!',
  className,
  limit = 500,
  communityFilter = true,
}: CommentsSectionProps) {
  const community = useCommunityAuthors();
  const communityAuthors = communityFilter ? community.data?.authors : undefined;

  const { data: commentsData, isLoading, error } = useComments(root, { limit, communityAuthors });
  const comments = commentsData?.topLevelComments || [];
  const loading = isLoading || (communityFilter && community.isLoading);

  if (error) {
    return (
      <div className={cn('py-6 text-center text-muted-foreground', className)}>
        <MessageSquare className="mx-auto mb-2 h-8 w-8 opacity-50" />
        <p>Failed to load comments</p>
      </div>
    );
  }

  return (
    <div className={cn('space-y-6', className)}>
      <CommentForm root={root} />

      {loading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="space-y-3">
              <div className="flex items-center space-x-3">
                <Skeleton className="h-8 w-8 rounded-full" />
                <div className="space-y-1">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-3 w-16" />
                </div>
              </div>
              <Skeleton className="h-16 w-full" />
            </div>
          ))}
        </div>
      ) : comments.length === 0 ? (
        <div className="py-8 text-center text-muted-foreground">
          <MessageSquare className="mx-auto mb-4 h-12 w-12 opacity-30" />
          <p className="mb-2 text-lg font-medium">{emptyStateMessage}</p>
          <p className="text-sm">{emptyStateSubtitle}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {comments.map((comment) => (
            <Comment key={comment.id} root={root} comment={comment} limit={limit} communityAuthors={communityAuthors} />
          ))}
        </div>
      )}
    </div>
  );
}
