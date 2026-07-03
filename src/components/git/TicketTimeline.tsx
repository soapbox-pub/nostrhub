import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { NostrEvent } from '@nostrify/nostrify';
import { formatDistanceToNow } from 'date-fns';
import {
  CheckCircle2,
  CircleDashed,
  CircleDot,
  GitCommitHorizontal,
  GitMerge,
  MessageSquare,
  Reply,
  XCircle,
} from 'lucide-react';
import { useAuthor } from '@/hooks/useAuthor';
import { useCommentAnchor } from '@/hooks/useCommentAnchor';
import { useComments } from '@/hooks/useComments';
import { useCommunityAuthors } from '@/hooks/useCommunityAuthors';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useProfileUrl } from '@/hooks/useProfileUrl';
import { UserAvatar } from '@/components/UserAvatar';
import { NoteContent } from '@/components/NoteContent';
import { MarkdownContent } from '@/components/MarkdownContent';
import { CommentForm } from '@/components/comments/CommentForm';
import { Comment } from '@/components/comments/Comment';
import { shortNpub } from '@/lib/nostr';
import {
  GIT_ISSUE_KIND,
  GIT_PATCH_KIND,
  GIT_STATUS_APPLIED_KIND,
  GIT_STATUS_CLOSED_KIND,
  GIT_STATUS_DRAFT_KIND,
  GIT_STATUS_OPEN_KIND,
  shortCommit,
} from '@/lib/git';
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

/** Icon + phrasing for a lifecycle status event, GitHub-style. */
function statusAction(
  kind: number,
  ticketKind?: number,
): { text: string; icon: typeof CircleDot; className: string } {
  switch (kind) {
    case GIT_STATUS_OPEN_KIND:
      return { text: 'reopened this', icon: CircleDot, className: 'bg-chart-5 text-white' };
    case GIT_STATUS_APPLIED_KIND:
      if (ticketKind === GIT_ISSUE_KIND) {
        return { text: 'resolved this', icon: CheckCircle2, className: 'bg-nebula text-white' };
      }
      if (ticketKind === GIT_PATCH_KIND) {
        return { text: 'applied this', icon: CheckCircle2, className: 'bg-nebula text-white' };
      }
      return { text: 'merged this', icon: GitMerge, className: 'bg-nebula text-white' };
    case GIT_STATUS_CLOSED_KIND:
      return {
        text: 'closed this',
        icon: XCircle,
        className: 'bg-destructive text-destructive-foreground',
      };
    case GIT_STATUS_DRAFT_KIND:
      return {
        text: 'marked this as a draft',
        icon: CircleDashed,
        className: 'bg-muted-foreground text-background',
      };
    default:
      return { text: 'updated the status', icon: CircleDot, className: 'bg-muted text-foreground' };
  }
}

/** A timeline row with an icon badge in the avatar gutter (statuses, pushes). */
function IconItem({
  icon: Icon,
  iconClassName,
  children,
  connector = true,
}: {
  icon: typeof CircleDot;
  iconClassName?: string;
  children: React.ReactNode;
  connector?: boolean;
}) {
  return (
    <div className="relative flex gap-3 sm:gap-4">
      {connector && <Rail />}
      <span
        className={cn(
          'relative z-10 grid size-8 shrink-0 place-items-center rounded-full',
          iconClassName,
        )}
        aria-hidden="true"
      >
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1 pt-1.5">{children}</div>
    </div>
  );
}

/** Inline "Name did-something · time" author phrase for icon rows. */
function ActorPhrase({ pubkey, action, createdAt }: { pubkey: string; action: React.ReactNode; createdAt: number }) {
  const author = useAuthor(pubkey);
  const profileUrl = useProfileUrl(pubkey, author.data?.metadata);
  const name =
    author.data?.metadata?.name ||
    author.data?.metadata?.display_name ||
    shortNpub(pubkey);
  return (
    <p className="text-sm text-muted-foreground">
      <Link to={profileUrl} className="font-semibold text-foreground hover:text-primary">
        {name}
      </Link>{' '}
      {action}{' '}
      <span className="whitespace-nowrap">
        {formatDistanceToNow(new Date(createdAt * 1000), { addSuffix: true })}
      </span>
    </p>
  );
}

/** A lifecycle status event (1630-1633) as a timeline row. */
function StatusItem({ event, ticketKind }: { event: NostrEvent; ticketKind?: number }) {
  const meta = statusAction(event.kind, ticketKind);
  const mergeCommit =
    event.tags.find(([n]) => n === 'merge-commit')?.[1] ??
    event.tags.find(([n]) => n === 'merge-commit-id')?.[1];
  const appliedCommits = event.tags
    .filter(([n]) => n === 'applied-as-commits')
    .flatMap((t) => t.slice(1));

  return (
    <IconItem icon={meta.icon} iconClassName={meta.className}>
      <div className="space-y-2">
        <ActorPhrase
          pubkey={event.pubkey}
          createdAt={event.created_at}
          action={
            <>
              {meta.text}
              {mergeCommit && (
                <>
                  {' '}
                  as commit{' '}
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
                    {shortCommit(mergeCommit)}
                  </code>
                </>
              )}
              {appliedCommits.length > 0 && !mergeCommit && (
                <>
                  {' '}
                  as{' '}
                  {appliedCommits.map((c, i) => (
                    <span key={c}>
                      {i > 0 && ', '}
                      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
                        {shortCommit(c)}
                      </code>
                    </span>
                  ))}
                </>
              )}
            </>
          }
        />
        {event.content.trim() && (
          <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
            <div className="p-4 text-sm leading-relaxed">
              <MarkdownContent content={event.content} />
            </div>
          </div>
        )}
      </div>
    </IconItem>
  );
}

/** A PR update (kind 1619) as a timeline row: the tip moved. */
function PrUpdateItem({ event }: { event: NostrEvent }) {
  const tip = event.tags.find(([n]) => n === 'c')?.[1];
  return (
    <IconItem icon={GitCommitHorizontal} iconClassName="bg-muted text-muted-foreground">
      <ActorPhrase
        pubkey={event.pubkey}
        createdAt={event.created_at}
        action={
          tip ? (
            <>
              updated the tip to{' '}
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
                {shortCommit(tip)}
              </code>
            </>
          ) : (
            'pushed an update'
          )
        }
      />
    </IconItem>
  );
}

interface TicketTimelineProps {
  /** The issue / merge-request event (the timeline root). */
  root: NostrEvent;
  /** Author pubkey of the original post (rendered as the first item). */
  authorPubkey: string;
  /** The original post's rendered body (markdown card header + content). */
  original: React.ReactNode;
  /** Trusted lifecycle status events (1630-1633), any order. */
  statusEvents?: NostrEvent[];
  /** Trusted PR updates (kind 1619), any order. */
  prUpdates?: NostrEvent[];
  /** The root ticket kind, to phrase kind-1631 statuses correctly. */
  ticketKind?: number;
  limit?: number;
}

/**
 * GitHub-style conversation timeline for an issue / merge request: the original
 * post, comments, lifecycle status changes ("closed this", "merged this"), and
 * PR tip updates share one continuous avatar-gutter rail in chronological
 * order, with the "leave a comment" box as the final item in the chain.
 */
export function TicketTimeline({
  root,
  authorPubkey,
  original,
  statusEvents = [],
  prUpdates = [],
  ticketKind,
  limit = 500,
}: TicketTimelineProps) {
  const community = useCommunityAuthors();
  const communityAuthors = community.data?.authors;
  const { data, isLoading } = useComments(root, { limit, communityAuthors });
  const comments = data?.topLevelComments ?? [];
  const loading = isLoading || community.isLoading;

  // Interleave comments, statuses, and tip updates chronologically.
  type Entry =
    | { type: 'comment'; event: NostrEvent }
    | { type: 'status'; event: NostrEvent }
    | { type: 'update'; event: NostrEvent };
  const entries: Entry[] = [
    ...comments.map((event) => ({ type: 'comment' as const, event })),
    ...statusEvents.map((event) => ({ type: 'status' as const, event })),
    ...prUpdates.map((event) => ({ type: 'update' as const, event })),
  ].sort((a, b) => a.event.created_at - b.event.created_at);

  return (
    <div className="space-y-5">
      {/* 1) Original post — always has the compose box (and any comments) below. */}
      <TimelineItem pubkey={authorPubkey}>{original}</TimelineItem>

      {/* 2) Conversation + lifecycle entries. */}
      {loading ? (
        <TimelineItem pubkey={authorPubkey}>
          <Skeleton className="h-24 w-full rounded-xl" />
        </TimelineItem>
      ) : (
        entries.map((entry) =>
          entry.type === 'comment' ? (
            <TimelineItem key={entry.event.id} pubkey={entry.event.pubkey}>
              <TopLevelComment
                root={root}
                comment={entry.event}
                communityAuthors={communityAuthors}
                limit={limit}
              />
            </TimelineItem>
          ) : entry.type === 'status' ? (
            <StatusItem key={entry.event.id} event={entry.event} ticketKind={ticketKind} />
          ) : (
            <PrUpdateItem key={entry.event.id} event={entry.event} />
          ),
        )
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
