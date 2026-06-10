import { useEffect, useRef } from 'react';
import { NostrEvent } from '@nostrify/nostrify';
import { ChatMessage } from './ChatMessage';
import { ChatTypingIndicator } from './ChatTypingIndicator';
import { isAiContent } from '@/lib/ai';
import { Skeleton } from '@/components/ui/skeleton';

interface ChatMessageListProps {
  messages: NostrEvent[];
  isLoading: boolean;
  channelLabel: string;
  /** When true, render an "AI is typing…" indicator at the bottom. */
  aiTyping?: boolean;
}

// Messages from the same author within this window are visually grouped.
const GROUP_WINDOW_SECONDS = 5 * 60;

function MessageSkeleton() {
  return (
    <div className="flex gap-3 px-4 py-2">
      <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3.5 w-32" />
        <Skeleton className="h-3.5 w-3/4" />
      </div>
    </div>
  );
}

export function ChatMessageList({ messages, isLoading, channelLabel, aiTyping = false }: ChatMessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastId = messages[messages.length - 1]?.id;

  // Auto-scroll to the newest message as messages arrive (and when AI starts typing).
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [lastId, aiTyping]);

  if (isLoading && messages.length === 0) {
    return (
      <div className="space-y-2 py-4">
        <MessageSkeleton />
        <MessageSkeleton />
        <MessageSkeleton />
      </div>
    );
  }

  if (messages.length === 0 && !aiTyping) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-8 py-16 text-center">
        <div className="mb-3 flex size-14 items-center justify-center rounded-full bg-primary/10 text-2xl font-bold text-primary">
          #
        </div>
        <h3 className="text-lg font-semibold">Welcome to #{channelLabel}</h3>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          This is the start of the channel. Be the first to say something.
        </p>
      </div>
    );
  }

  return (
    <div className="py-4">
      {messages.map((message, i) => {
        const prev = messages[i - 1];
        // Group consecutive messages from the same author within the window,
        // but never group an AI message with a regular one (or vice versa) —
        // they render as different identities.
        const grouped =
          !!prev &&
          prev.pubkey === message.pubkey &&
          isAiContent(prev) === isAiContent(message) &&
          message.created_at - prev.created_at < GROUP_WINDOW_SECONDS;
        return <ChatMessage key={message.id} message={message} grouped={grouped} />;
      })}
      {aiTyping && <ChatTypingIndicator />}
      <div ref={bottomRef} />
    </div>
  );
}

export default ChatMessageList;
