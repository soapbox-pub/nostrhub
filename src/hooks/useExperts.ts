import { useCallback, useMemo } from 'react';
import { useNostr } from '@nostrify/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';

import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { DEFAULT_EXPERTS, EXPERTS_LIST_KIND } from '@/lib/experts';

/** Parsed contents of an experts list event. */
interface ParsedExperts {
  pubkeys: string[];
  /** True when the list is stored encrypted in the event content (NIP-44). */
  isPrivate: boolean;
}

/** Extract hex pubkeys from `p` tags. */
function pubkeysFromTags(tags: string[][]): string[] {
  return tags.filter(([name, value]) => name === 'p' && value).map(([, value]) => value);
}

/**
 * Read and manage the user's "Nostr Experts" — the pubkeys whose NIP approvals
 * are counted for ranking and whose follow lists derive the community.
 *
 * The list is stored in a kind {@link EXPERTS_LIST_KIND} replaceable event:
 * - **Public:** experts as `["p", hex]` tags, empty content.
 * - **Private:** experts NIP-44-encrypted (to self) as a JSON array of `p`
 *   tags in the event content, mirroring NIP-51 private lists.
 *
 * Until the user has published a list, the built-in {@link DEFAULT_EXPERTS}
 * baseline is used so ranking/community/badges work out of the box.
 *
 * The read/parse/optimistic-publish flow mirrors `useEncryptedSettings`.
 */
export function useExperts() {
  const { config } = useAppContext();
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();

  // ─── Read the experts list event ──────────────────────────────────────
  const eventQuery = useQuery({
    queryKey: ['experts', user?.pubkey],
    queryFn: async ({ signal }) => {
      if (!user) return null;
      const filter: NostrFilter = {
        kinds: [EXPERTS_LIST_KIND],
        authors: [user.pubkey],
        limit: 1,
      };
      const events = await nostr.query([filter], { signal });
      // Keep the newest in case a relay returns more than one.
      return events.reduce<NostrEvent | null>(
        (newest, e) => (!newest || e.created_at > newest.created_at ? e : newest),
        null,
      );
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    gcTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: false,
  });

  // ─── Parse (and decrypt) the list from the event ──────────────────────
  const parsedQuery = useQuery({
    queryKey: ['expertsParsed', eventQuery.data?.id],
    queryFn: async (): Promise<ParsedExperts> => {
      const event = eventQuery.data;
      if (!event || !user) return { pubkeys: [], isPrivate: false };

      const pubkeys = pubkeysFromTags(event.tags);

      // Private list: experts live encrypted in the content.
      if (event.content && user.signer.nip44) {
        try {
          const decrypted = await user.signer.nip44.decrypt(user.pubkey, event.content);
          const tags = JSON.parse(decrypted) as string[][];
          pubkeys.push(...pubkeysFromTags(tags));
          return { pubkeys: Array.from(new Set(pubkeys)), isPrivate: true };
        } catch (error) {
          console.error('Failed to decrypt experts list:', error);
          return { pubkeys: Array.from(new Set(pubkeys)), isPrivate: true };
        }
      }

      return { pubkeys: Array.from(new Set(pubkeys)), isPrivate: false };
    },
    enabled: !!eventQuery.data && !!user,
    staleTime: 0,
    gcTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  // Resolved list: the user's published list, or the default baseline until
  // they have one. `null`/loading event → defaults.
  const experts = useMemo(() => {
    if (eventQuery.data) return parsedQuery.data?.pubkeys ?? DEFAULT_EXPERTS;
    return DEFAULT_EXPERTS;
  }, [eventQuery.data, parsedQuery.data]);

  const isPrivate = parsedQuery.data?.isPrivate ?? false;
  const expertSet = useMemo(() => new Set(experts), [experts]);
  const isExpert = useCallback((pubkey: string) => expertSet.has(pubkey), [expertSet]);

  // ─── Publish a new experts list event ─────────────────────────────────
  const publishExperts = useMutation({
    mutationFn: async ({ pubkeys, private: isPrivateList }: { pubkeys: string[]; private: boolean }) => {
      if (!user) throw new Error('User is not logged in');

      const unique = Array.from(new Set(pubkeys));
      const tags: string[][] = [
        ['alt', 'Nostr Experts list (NostrHub)'],
        ['client', config.appName],
      ];
      let content = '';

      if (isPrivateList) {
        if (!user.signer.nip44) {
          throw new Error('NIP-44 encryption not supported by this signer');
        }
        const plaintext = JSON.stringify(unique.map((pk) => ['p', pk]));
        content = await user.signer.nip44.encrypt(user.pubkey, plaintext);
      } else {
        tags.push(...unique.map((pk) => ['p', pk]));
      }

      const signedEvent = await user.signer.signEvent({
        kind: EXPERTS_LIST_KIND,
        content,
        tags,
        created_at: Math.floor(Date.now() / 1000),
      });

      await nostr.event(signedEvent, { signal: AbortSignal.timeout(5000) });
      return { signedEvent, pubkeys: unique, isPrivate: isPrivateList };
    },
    // Update the cache in place so badges flip instantly without a relay
    // round-trip (mirrors useEncryptedSettings).
    onSuccess: ({ signedEvent, pubkeys, isPrivate: isPrivateList }) => {
      queryClient.setQueryData(['experts', user?.pubkey], signedEvent);
      queryClient.setQueryData(['expertsParsed', signedEvent.id], {
        pubkeys,
        isPrivate: isPrivateList,
      } satisfies ParsedExperts);
    },
    onError: (error) => {
      console.error('Failed to publish experts list:', error);
    },
  });

  // ─── Immediate-publish convenience wrappers ───────────────────────────
  // Each computes the next list from the currently-resolved experts and
  // republishes, preserving the current public/private mode.
  const addExpert = useCallback(
    (pubkey: string) => {
      if (!pubkey || expertSet.has(pubkey)) return;
      publishExperts.mutate({ pubkeys: [...experts, pubkey], private: isPrivate });
    },
    [experts, expertSet, isPrivate, publishExperts],
  );

  const removeExpert = useCallback(
    (pubkey: string) => {
      publishExperts.mutate({ pubkeys: experts.filter((p) => p !== pubkey), private: isPrivate });
    },
    [experts, isPrivate, publishExperts],
  );

  const toggleExpert = useCallback(
    (pubkey: string) => {
      if (expertSet.has(pubkey)) removeExpert(pubkey);
      else addExpert(pubkey);
    },
    [expertSet, addExpert, removeExpert],
  );

  const setExperts = useCallback(
    (pubkeys: string[]) => {
      publishExperts.mutate({ pubkeys, private: isPrivate });
    },
    [isPrivate, publishExperts],
  );

  return {
    experts,
    expertSet,
    isExpert,
    isPrivate,
    isLoading: eventQuery.isLoading || parsedQuery.isLoading,
    addExpert,
    removeExpert,
    toggleExpert,
    setExperts,
    /** Publish an explicit list with a chosen privacy mode (used by the editor's Save). */
    publishExperts,
  };
}
