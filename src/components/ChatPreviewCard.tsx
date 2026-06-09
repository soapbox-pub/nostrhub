import { Link } from 'react-router-dom';
import { Hash } from 'lucide-react';
import { NostrEvent } from '@nostrify/nostrify';
import { nip19 } from 'nostr-tools';
import { useChatMessages } from '@/hooks/useChatMessages';
import { useCommunityAuthors } from '@/hooks/useCommunityAuthors';
import { useAuthor } from '@/hooks/useAuthor';
import { DEFAULT_TOPIC } from '@/lib/chat';
import { shortNpub } from '@/lib/nostr';
import { ChatMessageContent } from '@/components/chat/ChatMessageContent';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

/** Compact relative timestamp: "20m", "3h", "2d", or "now". */
function shortAgo(date: Date): string {
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return 'now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return `${Math.floor(days / 7)}w`;
}

/** A single message line in the compact preview. */
function PreviewMessage({ message, showHeader }: { message: NostrEvent; showHeader: boolean }) {
  const author = useAuthor(message.pubkey);
  const metadata = author.data?.metadata;
  const displayName = metadata?.name ?? metadata?.display_name ?? shortNpub(message.pubkey);
  const npub = nip19.npubEncode(message.pubkey);
  const date = new Date(message.created_at * 1000);

  return (
    <div className={showHeader ? 'min-w-0' : 'mt-0.5 min-w-0'}>
      <div className="w-fit max-w-full rounded-2xl rounded-tl-sm bg-muted px-3 py-1.5 text-xs leading-snug text-foreground">
        {showHeader && (
          <div className="mb-0.5 flex items-baseline gap-1.5">
            <Link to={`/${npub}`} className="truncate font-semibold hover:underline">
              {displayName}
            </Link>
            <time
              dateTime={date.toISOString()}
              className="shrink-0 text-[10px] text-muted-foreground"
            >
              {shortAgo(date)}
            </time>
          </div>
        )}
        <div className="line-clamp-3">
          <ChatMessageContent content={message.content} />
        </div>
      </div>
    </div>
  );
}

function PreviewSkeleton() {
  return <Skeleton className="h-10 w-4/5 rounded-2xl rounded-tl-sm" />;
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

  // The 5 most recent messages, in chat order (oldest → newest).
  const recent = messages.slice(-5);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-1.5 text-sm font-medium">
          <Hash className="size-4 text-muted-foreground" />
          {DEFAULT_TOPIC}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {isLoading || community.isLoading ? (
          <div className="space-y-3">
            <PreviewSkeleton />
            <PreviewSkeleton />
            <PreviewSkeleton />
          </div>
        ) : recent.length > 0 ? (
          recent.map((message, i) => (
            <PreviewMessage
              key={message.id}
              message={message}
              showHeader={recent[i - 1]?.pubkey !== message.pubkey}
            />
          ))
        ) : (
          <p className="text-xs text-muted-foreground">
            No messages yet. Be the first to say something.
          </p>
        )}
        <Link
          to={`/chat/${DEFAULT_TOPIC}`}
          className="block pt-1.5 text-xs font-medium text-primary hover:underline"
        >
          Open #{DEFAULT_TOPIC} chat →
        </Link>
      </CardContent>
    </Card>
  );
}

export default ChatPreviewCard;
