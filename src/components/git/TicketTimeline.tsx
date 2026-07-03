import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { NostrEvent } from '@nostrify/nostrify';
import { formatDistanceToNow } from 'date-fns';
import { MessageSquare, Reply } from 'lucide-react';
import { useAuthor } from '@/hooks/useAuthor';
import { useCommentAnchor } from '@/hooks/useCommentAnchor';
import { useComments } from '@/hooks/useComments';
import { useCommunityAuthors } from '@/hooks/useCommunityAuthors';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useProfileUrl } from '@/hooks/useProfileUrl';
import { UserAvatar } from '@/components/UserAvatar';
import { NoteContent } from '@/components/NoteContent';
import { CommentForm } from '@/components/comments/CommentForm';
import { Comment } from '@/components/comments/Comment';
import { shortNpub } from '@/lib/nostr';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/** One avatar-gutter row in the timeline. */
function TimelineItem({
  pubkey,
  children,
  connector = true,
}: {
  pubkey: string;
  children: React.ReactNode;
  /** Draw the rail downward from this avatar to the next row (false on the last row). */
  connector?: boolean;
}) {
  const profileUrl = useProfileUrl(pubkey, useAuthor(pubkey).data?.metadata);
  return (
    <div className="relative flex gap-3 sm:gap-4">
      {connector && <Rail />}
      <Link to={profileUrl} className="relative z-10 shrink-0">
        <UserAvatar pubkey={pubkey} size="default" />
      </Link>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/**
 * The rail running downward from this row's avatar center to the next row's
 * avatar. It starts at the avatar center (`size-8` → 16px from the row top) and
 * extends past the row bottom to bridge the `space-y-5` (20px) gap.
 */
function Rail() {
  return (
    <div
      className="pointer-events-none absolute left-4 top-4 -bottom-5 w-px bg-border"
      aria-hidden="true"
    />
  );
}

/** A single top-level comment card with its own nested reply thread. */
function TopLevelComment({
  root,
  comment,
  communityAuthors,
  limit,
}: {
  root: NostrEvent;
  comment: NostrEvent;
  communityAuthors?: string[];
  limit: number;
}) {
  const [showReply, setShowReply] = useState(false);
  const author = useAuthor(comment.pubkey);
  const profileUrl = useProfileUrl(comment.pubkey, author.data?.metadata);
  const { ref: anchorRef, isTarget: isAnchorTarget, domId: anchorId } = useCommentAnchor(comment.id);
  const name =    author.data?.metadata?.name ||
    author.data?.metadata?.display_name ||
    shortNpub(comment.pubkey);

  const { data } = useComments(root, { limit, communityAuthors });
  const replies = data?.getDirectReplies(comment.id) ?? [];

  return (
    <div className="space-y-3">
      <div
        ref={anchorRef}
        id={anchorId}
        className={cn(
          'overflow-hidden rounded-xl border bg-card shadow-sm scroll-mt-20',
          isAnchorTarget && 'ring-2 ring-primary/60',
        )}
      >
        <div className="flex items-center gap-2 border-b border-border/60 bg-muted/40 px-4 py-2.5 text-sm">
          <Link to={profileUrl} className="font-semibold hover:text-primary">
            {name}
          </Link>
          <span className="text-muted-foreground">
            commented{' '}
            {formatDistanceToNow(new Date(comment.created_at * 1000), { addSuffix: true })}
          </span>
        </div>
        <div className="p-4 text-sm leading-relaxed">
          <NoteContent event={comment} disableNoteEmbeds />
        </div>
        <div className="flex items-center gap-1 border-t border-border/60 px-3 py-1.5">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs text-muted-foreground"
            onClick={() => setShowReply((v) => !v)}
          >
            <Reply className="size-3.5" aria-hidden="true" /> Reply
          </Button>
        </div>
      </div>

      {showReply && (
        <CommentForm
          root={root}
          reply={comment}
          onSuccess={() => setShowReply(false)}
          placeholder={`Reply to ${name}…`}
          compact
        />
      )}

      {/* Nested replies reuse the existing recursive Comment renderer. */}
      {replies.length > 0 && (
        <div className="space-y-3 pl-2">
          {replies.map((reply) => (
            <Comment
              key={reply.id}
              root={root}
              comment={reply}
              depth={1}
              limit={limit}
              communityAuthors={communityAuthors}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface TicketTimelineProps {
  /** The issue / merge-request event (the timeline root). */
  root: NostrEvent;
  /** Author pubkey of the original post (rendered as the first item). */
  authorPubkey: string;
  /** The original post's rendered body (markdown card header + content). */
  original: React.ReactNode;
  limit?: number;
}

/**
 * GitHub-style conversation timeline for an issue / merge request: the original
 * post and every comment share one continuous avatar-gutter rail, with the
 * "leave a comment" box as the final item in the chain (not a separate block).
 */
export function TicketTimeline({ root, authorPubkey, original, limit = 500 }: TicketTimelineProps) {
  const community = useCommunityAuthors();
  const communityAuthors = community.data?.authors;
  const { data, isLoading } = useComments(root, { limit, communityAuthors });
  const comments = data?.topLevelComments ?? [];
  // Conversation reads oldest-first (top-level comments come newest-first).
  const ordered = [...comments].reverse();
  const loading = isLoading || community.isLoading;

  return (
    <div className="space-y-5">
      {/* 1) Original post — always has the compose box (and any comments) below. */}
      <TimelineItem pubkey={authorPubkey}>{original}</TimelineItem>

      {/* 2) Comments. */}
      {loading ? (
        <TimelineItem pubkey={authorPubkey}>
          <Skeleton className="h-24 w-full rounded-xl" />
        </TimelineItem>
      ) : (
        ordered.map((comment) => (
          <TimelineItem key={comment.id} pubkey={comment.pubkey}>
            <TopLevelComment
              root={root}
              comment={comment}
              communityAuthors={communityAuthors}
              limit={limit}
            />
          </TimelineItem>
        ))
      )}

      {/* 3) New-comment box as the final timeline item (no trailing rail). */}
      <NewCommentItem root={root} />
    </div>
  );
}

/** Final timeline row: the compose box, fronted by the current user's avatar. */
function NewCommentItem({ root }: { root: NostrEvent }) {
  const { user } = useCurrentUser();
  return (
    <div className="relative flex gap-3 sm:gap-4">
      {user ? (
        <UserAvatar pubkey={user.pubkey} size="default" className="relative z-10 shrink-0" />
      ) : (
        <div
          className="relative z-10 grid size-8 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground"
          aria-hidden="true"
        >
          <MessageSquare className="size-4" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <CommentForm root={root} placeholder="Add to the conversation…" />
      </div>
    </div>
  );
}

export default TicketTimeline;
