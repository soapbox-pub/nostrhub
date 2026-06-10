import { Bot } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

/**
 * Animated "AI is typing…" indicator shown in the chat transcript while the
 * in-chat AI assistant is generating a reply, making the AI feel like another
 * participant in the conversation.
 */
export function ChatTypingIndicator() {
  return (
    <div className="mt-3 flex items-center gap-3 px-4 py-1">
      <div className="w-10 shrink-0">
        <Avatar size="default" className="bg-primary/10 ring-1 ring-primary/40">
          <AvatarFallback className="bg-primary/10 text-primary">
            <Bot className="size-1/2" />
          </AvatarFallback>
        </Avatar>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-primary">AI</span>
        <span className="flex items-center gap-1 rounded-full bg-muted px-3 py-2" aria-label="AI is typing">
          <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:-0.3s]" />
          <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:-0.15s]" />
          <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/60" />
        </span>
      </div>
    </div>
  );
}

export default ChatTypingIndicator;
