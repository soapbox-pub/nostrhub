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
    <div className="min-w-0">
      <div className="mb-0.5 flex items-baseline gap-1.5 px-1">
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
      <div className="line-clamp-3 w-fit max-w-full rounded-2xl rounded-tl-sm bg-muted px-3 py-1.5 text-xs leading-snug text-foreground">
        <ChatMessageContent content={message.content} />
      </div>
    </div>
  );
}

function PreviewSkeleton() {
  return (
    <div className="space-y-1">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="h-7 w-4/5 rounded-2xl rounded-tl-sm" />
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
          {DEFAULT_TOPIC}
        </CardTitle>
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
