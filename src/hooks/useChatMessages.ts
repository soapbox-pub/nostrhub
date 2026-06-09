import { NostrFilter } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { chatTopicUrl } from '@/lib/chat';

interface UseChatMessagesOptions {
  limit?: number;
  /**
   * Restrict displayed messages to this set of author pubkeys (the community
   * author set). Messages from authors outside the set are dropped client-side
   * for spam resistance. `undefined` shows all authors.
   */
  communityAuthors?: string[];
  /** Poll interval in ms for near-real-time updates. Defaults to 5000. */
  refetchInterval?: number;
}

/**
 * Loads the chat transcript for a topic.
 *
 * A chat channel is a stream of NIP-C7 (kind 9) chat messages scoped to the
 * canonical URL `https://nostrhub.io/chat/<topic>` via a NIP-73 `i` tag. We
 * query that `#i` reference and present the messages oldest → newest for a
 * chat-style transcript.
 */
export function useChatMessages(topic: string, options: UseChatMessagesOptions = {}) {
  const { nostr } = useNostr();
  const { limit = 200, communityAuthors, refetchInterval = 5000 } = options;
  const allow = communityAuthors ? new Set(communityAuthors) : null;
  const url = chatTopicUrl(topic).toString();

  return useQuery({
    queryKey: ['chat', 'messages', url, limit, allow ? allow.size : null],
    queryFn: async (c) => {
      const filter: NostrFilter = { kinds: [9], '#i': [url], limit };
      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(5000)]);
      const raw = await nostr.query([filter], { signal });

      // Spam resistance: keep only messages authored by the community set.
      const events = allow ? raw.filter((e) => allow.has(e.pubkey)) : raw;

      // Oldest first for a chat transcript.
      return events.sort((a, b) => a.created_at - b.created_at || (a.id < b.id ? -1 : 1));
    },
    enabled: !!topic,
    refetchInterval,
  });
}
