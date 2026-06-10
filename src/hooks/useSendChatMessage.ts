import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { chatTopicUrl } from '@/lib/chat';

interface SendChatMessageParams {
  topic: string;
  content: string;
}

/**
 * Sends a message to a community chat channel.
 *
 * Each message is a NIP-C7 (kind 9) chat message scoped to a channel by an
 * `i` tag (NIP-73 external content identifier) pointing at the topic URL
 * `https://nostrhub.io/chat/<topic>`, with `k=web` describing the identifier
 * kind. Scoping by the relay-indexable single-letter `i` tag lets clients
 * fetch a channel's transcript with `{ kinds: [9], '#i': [url] }`.
 */
export function useSendChatMessage() {
  const { mutateAsync: publishEvent } = useNostrPublish();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ topic, content }: SendChatMessageParams) => {
      const url = chatTopicUrl(topic).toString();
      const tags: string[][] = [
        // Channel scope: NIP-73 external content identifier (the topic URL).
        ['i', url],
        ['k', 'web'],
      ];
      return publishEvent({ kind: 9, content, tags });
    },
    onSuccess: (event: NostrEvent, { topic }) => {
      const url = chatTopicUrl(topic).toString();
      // Optimistically insert the published event into every matching chat
      // transcript cache so the message appears instantly, rather than waiting
      // for the next relay poll/refetch (which can take several seconds).
      queryClient.setQueriesData<NostrEvent[]>({ queryKey: ['chat', 'messages', url] }, (old) => {
        if (!old) return old;
        if (old.some((m) => m.id === event.id)) return old;
        return [...old, event].sort(
          (a, b) => a.created_at - b.created_at || (a.id < b.id ? -1 : 1),
        );
      });
    },
  });
}
