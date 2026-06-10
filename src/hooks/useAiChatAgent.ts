import { useCallback, useRef, useState } from 'react';
import OpenAI from 'openai';
import { useNostr } from '@nostrify/react';
import { useQueryClient } from '@tanstack/react-query';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useAppContext } from '@/hooks/useAppContext';
import { useToast } from '@/hooks/useToast';
import { chatTopicUrl } from '@/lib/chat';
import { aiLabelTags, createAIClient, isAiConfigured } from '@/lib/ai';
import type { NostrFilter } from '@nostrify/nostrify';

/** Hard ceiling on agent steps to prevent runaway tool loops. */
const MAX_STEPS = 8;

/** How many recent messages the history tool returns. */
const HISTORY_LIMIT = 30;

const SYSTEM_PROMPT = `You are a helpful AI assistant participating in a public Nostr group chat channel.

You were invoked because a user addressed you with "@ai". Reply conversationally and concisely, as a chat participant would — no markdown headers, keep it short and to the point.

You can call the "get_recent_messages" tool to read the recent conversation in the current channel if you need context about what is being discussed. Call it when the user's request references the ongoing conversation ("what did they mean", "summarize", "who said", etc.). Otherwise, just answer.

When you are finished, respond with your final chat message as plain text and stop. Your final message will be posted to the channel verbatim.`;

const TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'get_recent_messages',
      description:
        'Fetch the most recent messages in the current chat channel, oldest first. Use this to understand the ongoing conversation.',
      parameters: {
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            description: `Maximum number of messages to return (default ${HISTORY_LIMIT}).`,
          },
        },
      },
    },
  },
];

interface RunAiReplyParams {
  topic: string;
  /** The user's prompt with the leading "@ai" trigger already stripped. */
  prompt: string;
}

/**
 * Runs the in-chat AI assistant.
 *
 * When a user sends a message starting with "@ai", this hook drives an agent
 * loop against the configured OpenAI-compatible provider (direct browser →
 * provider call). The model may call tools (currently: read recent channel
 * history) and loops until it produces a final text answer. That answer is then
 * published *by the user themselves* as a NIP-C7 kind 9 chat message carrying a
 * NIP-32 `agent/ai` label so clients render it as AI-authored content.
 *
 * `typingTopic` is the topic for which the AI is currently "typing" (drives the
 * chat typing indicator), or `null` when idle.
 */
export function useAiChatAgent() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { config } = useAppContext();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [typingTopic, setTypingTopic] = useState<string | null>(null);
  const runningRef = useRef(false);

  const getRecentMessages = useCallback(
    async (topic: string, limit: number): Promise<string> => {
      const url = chatTopicUrl(topic).toString();
      const filter: NostrFilter = { kinds: [9], '#i': [url], limit: Math.min(limit, 100) };
      const events = await nostr.query([filter], { signal: AbortSignal.timeout(8000) });
      const sorted = events
        .sort((a, b) => a.created_at - b.created_at || (a.id < b.id ? -1 : 1))
        .slice(-limit);
      if (sorted.length === 0) return 'No recent messages in this channel.';
      return sorted
        .map((e) => {
          const author = e.pubkey === user?.pubkey ? 'you' : e.pubkey.slice(0, 8);
          return `${author}: ${e.content}`;
        })
        .join('\n');
    },
    [nostr, user?.pubkey],
  );

  const runAiReply = useCallback(
    async ({ topic, prompt }: RunAiReplyParams) => {
      if (runningRef.current) return;
      if (!user) {
        toast({ title: 'You must be logged in', variant: 'destructive' });
        return;
      }
      if (!isAiConfigured(config.ai)) {
        toast({
          title: 'AI is not configured',
          description: 'Set an AI base URL and model under Settings to use @ai.',
          variant: 'destructive',
        });
        return;
      }

      runningRef.current = true;
      setTypingTopic(topic);

      try {
        const openai = createAIClient(config.ai);
        const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ];

        let finalText = '';

        for (let step = 0; step < MAX_STEPS; step++) {
          const completion = await openai.chat.completions.create({
            model: config.ai.model,
            messages,
            tools: TOOLS,
          });

          const choice = completion.choices[0];
          const message = choice?.message;
          if (!message) break;

          messages.push(message);

          const toolCalls = message.tool_calls ?? [];
          if (toolCalls.length === 0) {
            finalText = (message.content ?? '').trim();
            break;
          }

          // Execute each requested tool and feed the results back to the model.
          for (const call of toolCalls) {
            if (call.type !== 'function') continue;
            let result = '';
            try {
              if (call.function.name === 'get_recent_messages') {
                const args = call.function.arguments
                  ? (JSON.parse(call.function.arguments) as { limit?: number })
                  : {};
                result = await getRecentMessages(topic, args.limit ?? HISTORY_LIMIT);
              } else {
                result = `Unknown tool: ${call.function.name}`;
              }
            } catch (err) {
              result = `Tool error: ${err instanceof Error ? err.message : 'unknown'}`;
            }
            messages.push({ role: 'tool', tool_call_id: call.id, content: result });
          }
        }

        if (!finalText) {
          throw new Error('The AI did not produce a reply.');
        }

        // Publish the AI's reply as the user's own kind 9 message, tagged as
        // AI-generated content (NIP-32).
        const url = chatTopicUrl(topic).toString();
        await publishEvent({
          kind: 9,
          content: finalText,
          tags: [['i', url], ['k', 'web'], ...aiLabelTags()],
        });

        queryClient.invalidateQueries({ queryKey: ['chat', 'messages', url] });
      } catch (error) {
        toast({
          title: 'AI reply failed',
          description: error instanceof Error ? error.message : 'Unknown error',
          variant: 'destructive',
        });
      } finally {
        runningRef.current = false;
        setTypingTopic(null);
      }
    },
    [user, config.ai, getRecentMessages, publishEvent, queryClient, toast],
  );

  return { runAiReply, typingTopic };
}
