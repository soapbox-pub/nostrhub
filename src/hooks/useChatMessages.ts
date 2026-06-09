import { NostrEvent, NostrFilter } from '@nostrify/nostrify';
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
 * A chat channel is a NIP-22 (kind 1111) thread rooted on the canonical URL
 * `https://nostrhub.io/chat/<topic>`. We query the root `#I` reference and keep
 * only the top-level messages (those whose lowercase `i` tag matches the topic
 * URL — i.e. direct messages to the channel, not nested replies), sorted oldest
 * → newest for a chat-style transcript.
 */
export function useChatMessages(topic: string, options: UseChatMessagesOptions = {}) {
  const { nostr } = useNostr();
  const { limit = 200, communityAuthors, refetchInterval = 5000 } = options;
  const allow = communityAuthors ? new Set(communityAuthors) : null;
  const url = chatTopicUrl(topic).toString();

  return useQuery({
    queryKey: ['chat', 'messages', url, limit, allow ? allow.size : null],
    queryFn: async (c) => {
      const filter: NostrFilter = { kinds: [1111], '#I': [url], limit };
      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(5000)]);
      const raw = await nostr.query([filter], { signal });

      // Spam resistance: keep only messages authored by the community set.
      const events = allow ? raw.filter((e) => allow.has(e.pubkey)) : raw;

      const getTag = (event: NostrEvent, name: string): string | undefined =>
        event.tags.find(([n]) => n === name)?.[1];

      // Top-level channel messages reference the topic URL via a lowercase `i`
      // tag (NIP-22 reply scope). Nested replies reference another event (`e`),
      // so they are excluded from the flat transcript.
      const topLevel = events.filter((e) => getTag(e, 'i') === url);

      // Oldest first for a chat transcript.
      return topLevel.sort((a, b) => a.created_at - b.created_at || (a.id < b.id ? -1 : 1));
    },
    enabled: !!topic,
    refetchInterval,
  });
}
