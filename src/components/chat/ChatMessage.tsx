import { useState } from 'react';
import { Link } from 'react-router-dom';
import { NostrEvent } from '@nostrify/nostrify';
import { nip19 } from 'nostr-tools';
import { format, formatDistanceToNow } from 'date-fns';
import { MoreHorizontal, ExternalLink, Trash2 } from 'lucide-react';
import { useAuthor } from '@/hooks/useAuthor';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useToast } from '@/hooks/useToast';
import { useQueryClient } from '@tanstack/react-query';
import { UserAvatar } from '@/components/UserAvatar';
import { AiAvatar } from './AiAvatar';
import { ChatMessageContent } from './ChatMessageContent';
import { isAiContent } from '@/lib/ai';
import { shortNpub } from '@/lib/nostr';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
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

interface ChatMessageProps {
  message: NostrEvent;
  /** When true, this message follows another from the same author — render compact. */
  grouped?: boolean;
}

export function ChatMessage({ message, grouped = false }: ChatMessageProps) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const author = useAuthor(message.pubkey);
  const { user } = useCurrentUser();
  const { mutate: publishEvent, isPending: isDeleting } = useNostrPublish();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const metadata = author.data?.metadata;
  const isAi = isAiContent(message);
  const authorName = metadata?.name ?? metadata?.display_name ?? shortNpub(message.pubkey);
  // AI-generated messages are presented as if posted by "AI", ignoring the
  // signing user's own profile.
  const displayName = isAi ? 'AI' : authorName;
  const npub = nip19.npubEncode(message.pubkey);
  const nevent = nip19.neventEncode({ id: message.id, author: message.pubkey, kind: message.kind });
  const date = new Date(message.created_at * 1000);
  const isOwn = user?.pubkey === message.pubkey;

  const handleDelete = () => {
    publishEvent(
      { kind: 5, content: '', tags: [['e', message.id], ['k', message.kind.toString()]] },
      {
        onSuccess: () => {
          toast({ title: 'Message deleted' });
          setShowDeleteDialog(false);
          queryClient.setQueriesData<NostrEvent[]>({ queryKey: ['chat', 'messages'] }, (old) =>
            old ? old.filter((m) => m.id !== message.id) : old,
          );
        },
        onError: (error) =>
          toast({ title: 'Failed to delete message', description: error.message, variant: 'destructive' }),
      },
    );
  };

  return (
    <div
      className={cn(
        'group relative flex gap-3 px-4 transition-colors hover:bg-muted/40',
        grouped ? 'py-0.5' : 'mt-3 py-1 first:mt-0',
      )}
    >
      {/* Avatar column */}
      <div className="w-10 shrink-0">
        {grouped ? (
          <span className="block w-10 select-none text-right text-[10px] leading-6 text-muted-foreground opacity-0 group-hover:opacity-100">
            {format(date, 'HH:mm')}
          </span>
        ) : isAi ? (
          <AiAvatar authorPubkey={message.pubkey} size="default" />
        ) : (
          <Link to={`/${npub}`} aria-label={`${displayName} profile`}>
            <UserAvatar pubkey={message.pubkey} size="default" />
          </Link>
        )}
      </div>

      {/* Message body */}
      <div className="min-w-0 flex-1">
        {!grouped && (
          <div className="flex items-baseline gap-2">
            {isAi ? (
              <span className="inline-flex items-baseline gap-1.5">
                <span className="text-sm font-semibold text-primary">AI</span>
                <Link
                  to={`/${npub}`}
                  className="text-[11px] text-muted-foreground hover:underline"
                  title="The user whose key signed this message"
                >
                  via {authorName}
                </Link>
              </span>
            ) : (
              <Link to={`/${npub}`} className="text-sm font-semibold hover:underline">
                {displayName}
              </Link>
            )}
            <time
              dateTime={date.toISOString()}
              title={format(date, 'PPpp')}
              className="text-xs text-muted-foreground"
            >
              {formatDistanceToNow(date, { addSuffix: true })}
            </time>
          </div>
        )}
        <div className="text-sm leading-relaxed text-foreground">
          <ChatMessageContent content={message.content} />
        </div>
      </div>

      {/* Hover actions */}
      <div className="absolute right-3 top-0 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7 rounded-md bg-background shadow-sm"
              aria-label="Message options"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <a href={`https://njump.me/${nevent}`} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="mr-2 h-3.5 w-3.5" />
                Open in njump
              </a>
            </DropdownMenuItem>
            {isOwn && (
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

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete message?</AlertDialogTitle>
            <AlertDialogDescription>
              This publishes a NIP-09 deletion request (kind 5). Relays and clients that honor deletion
              requests will hide this message, but deletion is not guaranteed across the network.
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

export default ChatMessage;
