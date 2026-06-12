import { NKinds, NostrEvent, NostrFilter } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';

interface UseCommentsOptions {
  limit?: number;
  /**
   * The community author set used as a spam-resistant `authors` filter. Comments
   * from authors outside this set are dropped client-side. This is required:
   * the query stays disabled until the set is provided, so a comments query is
   * never issued without the community filter.
   */
  communityAuthors?: string[];
}

export function useComments(
  root: NostrEvent | URL | `#${string}`,
  options: UseCommentsOptions = {},
) {
  const { nostr } = useNostr();
  const { limit, communityAuthors } = options;
  const allow = communityAuthors ? new Set(communityAuthors) : null;

  return useQuery({
    queryKey: [
      'nostr',
      'comments',
      root instanceof URL ? root.toString() : typeof root === 'string' ? root : root.id,
      limit,
      allow ? allow.size : null,
    ],
    queryFn: async () => {
      const filter: NostrFilter = { kinds: [1111] };

      if (typeof root === 'string') {
        filter['#I'] = [root];
      } else if (root instanceof URL) {
        filter['#I'] = [root.toString()];
      } else if (NKinds.addressable(root.kind)) {
        const d = root.tags.find(([name]) => name === 'd')?.[1] ?? '';
        filter['#A'] = [`${root.kind}:${root.pubkey}:${d}`];
      } else if (NKinds.replaceable(root.kind)) {
        filter['#A'] = [`${root.kind}:${root.pubkey}:`];
      } else {
        filter['#E'] = [root.id];
      }

      if (typeof limit === 'number') filter.limit = limit;

      // Spam resistance: constrain to the community author set at the relay.
      if (allow) filter.authors = Array.from(allow);

      const signal = AbortSignal.timeout(5000);
      const raw = await nostr.query([filter], { signal });

      // Defensive re-filter in case a relay ignores the authors constraint.
      const events = allow ? raw.filter((e) => allow.has(e.pubkey)) : raw;

      const getTagValue = (event: NostrEvent, tagName: string): string | undefined =>
        event.tags.find(([name]) => name === tagName)?.[1];

      const topLevelComments = events.filter((comment) => {
        if (typeof root === 'string') return getTagValue(comment, 'i') === root;
        if (root instanceof URL) return getTagValue(comment, 'i') === root.toString();
        if (NKinds.addressable(root.kind)) {
          const d = getTagValue(root, 'd') ?? '';
          return getTagValue(comment, 'a') === `${root.kind}:${root.pubkey}:${d}`;
        }
        if (NKinds.replaceable(root.kind)) {
          return getTagValue(comment, 'a') === `${root.kind}:${root.pubkey}:`;
        }
        return getTagValue(comment, 'e') === root.id;
      });

      const getDescendants = (parentId: string): NostrEvent[] => {
        const directReplies = events.filter((c) => getTagValue(c, 'e') === parentId);
        const all = [...directReplies];
        for (const reply of directReplies) all.push(...getDescendants(reply.id));
        return all;
      };

      const commentDescendants = new Map<string, NostrEvent[]>();
      for (const comment of events) commentDescendants.set(comment.id, getDescendants(comment.id));

      const sortedTopLevel = topLevelComments.sort((a, b) => b.created_at - a.created_at);

      return {
        allComments: events,
        topLevelComments: sortedTopLevel,
        getDescendants: (commentId: string) =>
          (commentDescendants.get(commentId) || []).sort((a, b) => a.created_at - b.created_at),
        getDirectReplies: (commentId: string) =>
          events
            .filter((c) => getTagValue(c, 'e') === commentId)
            .sort((a, b) => a.created_at - b.created_at),
      };
    },
    enabled: !!root && !!communityAuthors,
  });
}
