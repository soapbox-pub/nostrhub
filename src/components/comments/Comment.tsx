import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { NostrEvent } from '@nostrify/nostrify';
import { nip19 } from 'nostr-tools';
import { useAuthor } from '@/hooks/useAuthor';
import { useCommentAnchor } from '@/hooks/useCommentAnchor';
import { useComments } from '@/hooks/useComments';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useToast } from '@/hooks/useToast';
import { useQueryClient } from '@tanstack/react-query';
import { CommentForm } from './CommentForm';
import { NoteContent } from '@/components/NoteContent';
import { UserAvatar } from '@/components/UserAvatar';
import { shortNpub } from '@/lib/nostr';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  MessageSquare,
  ChevronDown,
  ChevronRight,
  MoreHorizontal,
  ExternalLink,
  Trash2,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface CommentProps {
  root: NostrEvent | URL | `#${string}`;
  comment: NostrEvent;
  depth?: number;
  maxDepth?: number;
  limit?: number;
  communityAuthors?: string[];
}

export function Comment({ root, comment, depth = 0, maxDepth = 3, limit, communityAuthors }: CommentProps) {
  const [showReplyForm, setShowReplyForm] = useState(false);
  // `null` until the user toggles; the default is derived below.
  const [repliesToggle, setRepliesToggle] = useState<boolean | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const author = useAuthor(comment.pubkey);
  const { data: commentsData } = useComments(root, { limit, communityAuthors });
  const { user } = useCurrentUser();
  const { mutate: publishEvent, isPending: isDeleting } = useNostrPublish();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { ref: anchorRef, isTarget: isAnchorTarget, domId: anchorId } = useCommentAnchor(comment.id);
  const { hash } = useLocation();

  const metadata = author.data?.metadata;
  const displayName = metadata?.name ?? metadata?.display_name ?? shortNpub(comment.pubkey);
  const timeAgo = formatDistanceToNow(new Date(comment.created_at * 1000), { addSuffix: true });
  const nevent = nip19.neventEncode({ id: comment.id, author: comment.pubkey, kind: comment.kind });
  const isOwnComment = user?.pubkey === comment.pubkey;

  const replies = commentsData?.getDirectReplies(comment.id) || [];
  const hasReplies = replies.length > 0;

  // A `#comment-<id>` permalink pointing into this comment's collapsed subtree
  // must default it open, or the anchor target would never mount.
  const targetId = hash.startsWith('#comment-') ? hash.slice('#comment-'.length) : undefined;
  const containsTarget = Boolean(
    targetId && commentsData?.getDescendants(comment.id).some((d) => d.id === targetId),
  );
  const showReplies = repliesToggle ?? (depth < 2 || containsTarget);

  const handleDelete = () => {
    publishEvent(
      { kind: 5, content: '', tags: [['e', comment.id], ['k', comment.kind.toString()]] },
      {
        onSuccess: () => {
          toast({ title: 'Comment deleted' });
          setShowDeleteDialog(false);
          queryClient.setQueriesData<ReturnType<typeof useComments>['data']>(
            { queryKey: ['nostr', 'comments'] },
            (oldData) => {
              if (!oldData) return oldData;
              return {
                ...oldData,
                allComments: oldData.allComments.filter((c) => c.id !== comment.id),
                topLevelComments: oldData.topLevelComments.filter((c) => c.id !== comment.id),
                getDescendants: (id: string) => oldData.getDescendants(id).filter((c) => c.id !== comment.id),
                getDirectReplies: (id: string) => oldData.getDirectReplies(id).filter((c) => c.id !== comment.id),
              };
            },
          );
        },
        onError: (error) =>
          toast({ title: 'Failed to delete comment', description: error.message, variant: 'destructive' }),
      },
    );
  };

  return (
    <div className={`space-y-3 ${depth > 0 ? 'ml-6 border-l-2 border-muted pl-4' : ''}`}>
      <Card
        ref={anchorRef}
        id={anchorId}
        className={cn('bg-card/50 scroll-mt-20', isAnchorTarget && 'ring-2 ring-primary/60')}
      >
        <CardContent className="p-4">
          <div className="space-y-3">
            <div className="flex items-start justify-between">
              <div className="flex items-center space-x-3">
                <Link to={`/${nip19.npubEncode(comment.pubkey)}`}>
                  <UserAvatar pubkey={comment.pubkey} size="sm" />
                </Link>
                <div>
                  <Link
                    to={`/${nip19.npubEncode(comment.pubkey)}`}
                    className="text-sm font-medium transition-colors hover:text-primary"
                  >
                    {displayName}
                  </Link>
                  <p className="text-xs text-muted-foreground">{timeAgo}</p>
                </div>
              </div>
            </div>

            <div className="text-sm leading-relaxed">
              <NoteContent event={comment} disableNoteEmbeds />
            </div>

            <div className="flex items-center justify-between pt-2">
              <div className="flex items-center space-x-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowReplyForm(!showReplyForm)}
                  className="h-8 px-2 text-xs"
                >
                  <MessageSquare className="mr-1 h-3 w-3" />
                  Reply
                </Button>

                {hasReplies && (
                  <Collapsible open={showReplies} onOpenChange={setRepliesToggle}>
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 px-2 text-xs">
                        {showReplies ? (
                          <ChevronDown className="mr-1 h-3 w-3" />
                        ) : (
                          <ChevronRight className="mr-1 h-3 w-3" />
                        )}
                        {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
                      </Button>
                    </CollapsibleTrigger>
                  </Collapsible>
                )}
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" aria-label="Comment options">
                    <MoreHorizontal className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild>
                    <a href={`https://ditto.pub/${nevent}`} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="mr-2 h-3.5 w-3.5" />
                      Open with Ditto
                    </a>
                  </DropdownMenuItem>
                  {isOwnComment && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onSelect={(e) => {
                          e.preventDefault();
                          setShowDeleteDialog(true);
                        }}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="mr-2 h-3.5 w-3.5" />
                        Delete
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </CardContent>
      </Card>

      {showReplyForm && (
        <div className="ml-6">
          <CommentForm
            root={root}
            reply={comment}
            onSuccess={() => setShowReplyForm(false)}
            placeholder="Write a reply..."
            compact
          />
        </div>
      )}

      {hasReplies && depth < maxDepth && (
        <Collapsible open={showReplies} onOpenChange={setRepliesToggle}>
          <CollapsibleContent className="space-y-3">
            {replies.map((reply) => (
              <Comment
                key={reply.id}
                root={root}
                comment={reply}
                depth={depth + 1}
                maxDepth={maxDepth}
                limit={limit}
                communityAuthors={communityAuthors}
              />
            ))}
          </CollapsibleContent>
        </Collapsible>
      )}

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete comment?</AlertDialogTitle>
            <AlertDialogDescription>
              This publishes a NIP-09 deletion request (kind 5). Relays and clients that honor deletion
              requests will hide this comment, but deletion is not guaranteed across the network.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
