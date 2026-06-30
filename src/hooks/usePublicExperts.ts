import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';

import { EXPERTS_LIST_KIND } from '@/lib/experts';

export interface PublicExperts {
  /** Whether the user has published an experts list (kind 12022) event at all. */
  hasList: boolean;
  /** True when the list is private — its members are NIP-44 encrypted and unreadable to others. */
  isPrivate: boolean;
  /** Public expert pubkeys. Empty when the list is private or absent. */
  pubkeys: string[];
}

/** Extract hex pubkeys from `p` tags. */
function pubkeysFromTags(tags: string[][]): string[] {
  return tags.filter(([name, value]) => name === 'p' && value).map(([, value]) => value);
}

/**
 * Load another user's public "Nostr Experts" list (kind {@link EXPERTS_LIST_KIND}).
 *
 * Only public `p` tags are readable; a private list keeps its members NIP-44
 * encrypted in the event content, so we can only report that one exists.
 */
export function usePublicExperts(pubkey: string | undefined) {
  const { nostr } = useNostr();

  return useQuery({
    queryKey: ['publicExperts', pubkey],
    queryFn: async ({ signal }): Promise<PublicExperts> => {
      if (!pubkey) return { hasList: false, isPrivate: false, pubkeys: [] };

      const filter: NostrFilter = {
        kinds: [EXPERTS_LIST_KIND],
        authors: [pubkey],
        limit: 1,
      };
      const events = await nostr.query([filter], {
        signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
      });
      const event = events.reduce<NostrEvent | null>(
        (newest, e) => (!newest || e.created_at > newest.created_at ? e : newest),
        null,
      );

      if (!event) return { hasList: false, isPrivate: false, pubkeys: [] };

      const pubkeys = pubkeysFromTags(event.tags);
      if (pubkeys.length > 0) {
        return { hasList: true, isPrivate: false, pubkeys: Array.from(new Set(pubkeys)) };
      }
      // No public tags: encrypted content means a private list, otherwise empty.
      return { hasList: true, isPrivate: !!event.content, pubkeys: [] };
    },
    enabled: !!pubkey,
    staleTime: 5 * 60 * 1000,
  });
}
