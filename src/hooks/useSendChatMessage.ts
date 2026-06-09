import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { chatTopicUrl } from '@/lib/chat';

interface SendChatMessageParams {
  topic: string;
  content: string;
}

/**
 * Sends a message to a community chat channel.
 *
 * Each message is a NIP-22 (kind 1111) comment rooted on the topic URL
 * `https://nostrhub.io/chat/<topic>`. Because the root is a web URL, both the
 * root (uppercase) and reply (lowercase) scopes point at the same URL with
 * `K=web` — these are top-level channel messages, not threaded replies.
 */
export function useSendChatMessage() {
  const { mutateAsync: publishEvent } = useNostrPublish();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ topic, content }: SendChatMessageParams) => {
      const url = chatTopicUrl(topic).toString();
      const tags: string[][] = [
        // Root scope (uppercase).
        ['I', url],
        ['K', 'web'],
        // Reply scope (lowercase) — same URL, marking this as a channel message.
        ['i', url],
        ['k', 'web'],
      ];
      return publishEvent({ kind: 1111, content, tags });
    },
    onSuccess: (_event, { topic }) => {
      const url = chatTopicUrl(topic).toString();
      queryClient.invalidateQueries({ queryKey: ['chat', 'messages', url] });
    },
  });
}
