import { Link } from 'react-router-dom';
import { Hash } from 'lucide-react';
import { NostrEvent } from '@nostrify/nostrify';
import { nip19 } from 'nostr-tools';
import { formatDistanceToNow } from 'date-fns';
import { useChatMessages } from '@/hooks/useChatMessages';
import { useCommunityAuthors } from '@/hooks/useCommunityAuthors';
import { useAuthor } from '@/hooks/useAuthor';
import { DEFAULT_TOPIC } from '@/lib/chat';
import { shortNpub } from '@/lib/nostr';
import { UserAvatar } from '@/components/UserAvatar';
import { ChatMessageContent } from '@/components/chat/ChatMessageContent';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

/** A single message line in the compact preview. */
function PreviewMessage({ message }: { message: NostrEvent }) {
  const author = useAuthor(message.pubkey);
  const metadata = author.data?.metadata;
  const displayName = metadata?.name ?? metadata?.display_name ?? shortNpub(message.pubkey);
  const npub = nip19.npubEncode(message.pubkey);
  const date = new Date(message.created_at * 1000);

  return (
    <div className="flex gap-2">
      <Link to={`/${npub}`} aria-label={`${displayName} profile`} className="shrink-0">
        <UserAvatar pubkey={message.pubkey} size="sm" />
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          <Link to={`/${npub}`} className="truncate text-xs font-semibold hover:underline">
            {displayName}
          </Link>
          <time
            dateTime={date.toISOString()}
            className="shrink-0 text-[10px] text-muted-foreground"
          >
            {formatDistanceToNow(date, { addSuffix: true })}
          </time>
        </div>
        <div className="line-clamp-2 text-xs leading-snug text-muted-foreground">
          <ChatMessageContent content={message.content} />
        </div>
      </div>
    </div>
  );
}

function PreviewSkeleton() {
  return (
    <div className="flex gap-2">
      <Skeleton className="size-8 shrink-0 rounded-full" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-3 w-4/5" />
      </div>
    </div>
  );
}

/**
 * Homepage sidebar card showing a live preview of the most recent messages in
 * the #general community chat channel.
 */
export function ChatPreviewCard() {
  const community = useCommunityAuthors();
  const { data: messages = [], isLoading } = useChatMessages(DEFAULT_TOPIC, {
    communityAuthors: community.data?.authors,
    limit: 30,
  });

  // Most recent messages, newest first, capped for a compact preview.
  const recent = [...messages].reverse().slice(0, 5);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-1.5 text-sm font-medium">
          <Hash className="size-4 text-muted-foreground" />
          {DEFAULT_TOPIC} chat
        </CardTitle>
        <p className="text-xs text-muted-foreground">Latest from the community</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading || community.isLoading ? (
          <>
            <PreviewSkeleton />
            <PreviewSkeleton />
            <PreviewSkeleton />
          </>
        ) : recent.length > 0 ? (
          recent.map((message) => <PreviewMessage key={message.id} message={message} />)
        ) : (
          <p className="text-xs text-muted-foreground">
            No messages yet. Be the first to say something.
          </p>
        )}
        <Link
          to={`/chat/${DEFAULT_TOPIC}`}
          className="block text-xs font-medium text-primary hover:underline"
        >
          Open #{DEFAULT_TOPIC} chat →
        </Link>
      </CardContent>
    </Card>
  );
}

export default ChatPreviewCard;
