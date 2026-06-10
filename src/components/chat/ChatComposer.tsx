import { useRef, useState } from 'react';
import { SendHorizontal, Sparkles } from 'lucide-react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useSendChatMessage } from '@/hooks/useSendChatMessage';
import { useToast } from '@/hooks/useToast';
import { LoginArea } from '@/components/auth/LoginArea';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { isAiPrompt, stripAiTrigger } from '@/lib/ai';
import { cn } from '@/lib/utils';

interface ChatComposerProps {
  topic: string;
  channelLabel: string;
  /** Invoked when a message addressed to the AI ("@ai …") is sent. */
  onAiPrompt: (prompt: string) => void;
  /** Whether the AI assistant is currently generating a reply for this channel. */
  aiBusy?: boolean;
}

export function ChatComposer({ topic, channelLabel, onAiPrompt, aiBusy = false }: ChatComposerProps) {
  const [content, setContent] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { user } = useCurrentUser();
  const { mutate: sendMessage, isPending } = useSendChatMessage();
  const { toast } = useToast();

  const targetsAi = isAiPrompt(content);

  const submit = () => {
    const trimmed = content.trim();
    if (!trimmed || !user || isPending) return;

    if (isAiPrompt(trimmed)) {
      const prompt = stripAiTrigger(trimmed);
      if (!prompt) {
        toast({ title: 'Ask the AI something after "@ai".' });
        return;
      }
      // Post the user's own message first so it appears in the transcript,
      // then kick off the AI reply.
      sendMessage(
        { topic, content: trimmed },
        {
          onSuccess: () => {
            setContent('');
            onAiPrompt(prompt);
            requestAnimationFrame(() => textareaRef.current?.focus());
          },
          onError: (error) =>
            toast({ title: 'Failed to send message', description: error.message, variant: 'destructive' }),
        },
      );
      return;
    }

    sendMessage(
      { topic, content: trimmed },
      {
        onSuccess: () => {
          setContent('');
          // Keep focus for fast successive messages.
          requestAnimationFrame(() => textareaRef.current?.focus());
        },
        onError: (error) =>
          toast({ title: 'Failed to send message', description: error.message, variant: 'destructive' }),
      },
    );
  };

  if (!user) {
    return (
      <div className="border-t bg-background px-4 py-4">
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed bg-muted/30 px-6 py-5 text-center">
          <p className="text-sm text-muted-foreground">Sign in to join the conversation in #{channelLabel}.</p>
          <LoginArea className="max-w-60" />
        </div>
      </div>
    );
  }

  return (
    <div className="border-t bg-background px-4 py-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className={cn(
          'flex items-end gap-2 rounded-xl border bg-background px-3 py-2',
          'focus-within:ring-2 focus-within:ring-ring',
          targetsAi && 'border-primary/60 focus-within:ring-primary',
        )}
      >
        <Textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={`Message #${channelLabel}`}
          rows={1}
          disabled={isPending}
          className="max-h-40 min-h-[40px] resize-none border-0 bg-transparent p-1 shadow-none focus-visible:ring-0"
          aria-label={`Message #${channelLabel}`}
        />
        <Button
          type="submit"
          size="icon"
          disabled={!content.trim() || isPending}
          className="h-9 w-9 shrink-0 rounded-lg"
          aria-label={targetsAi ? 'Ask the AI' : 'Send message'}
        >
          {targetsAi ? <Sparkles className="h-4 w-4" /> : <SendHorizontal className="h-4 w-4" />}
        </Button>
      </form>
      <p className="mt-1.5 px-1 text-[11px] text-muted-foreground">
        {targetsAi ? (
          <span className="inline-flex items-center gap-1 text-primary">
            <Sparkles className="h-3 w-3" /> The AI will reply in this channel.
          </span>
        ) : aiBusy ? (
          <span className="inline-flex items-center gap-1 text-primary">
            <Sparkles className="h-3 w-3 animate-pulse" /> AI is replying…
          </span>
        ) : (
          <>
            Start a message with <kbd className="rounded border px-1 font-sans">@ai</kbd> to ask the AI.{' '}
            <kbd className="rounded border px-1 font-sans">Enter</kbd> to send,{' '}
            <kbd className="rounded border px-1 font-sans">Shift</kbd>+
            <kbd className="rounded border px-1 font-sans">Enter</kbd> for a new line.
          </>
        )}
      </p>
    </div>
  );
}

export default ChatComposer;
