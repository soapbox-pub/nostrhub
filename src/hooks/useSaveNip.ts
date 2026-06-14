import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { CUSTOM_NIP_KIND, type CustomNip } from '@/lib/nips';

/** An event kind a NIP concerns, with a required human-readable name. */
export interface NipKind {
  /** Event kind number (as a string). */
  kind: string;
  /** Human-readable name, required at publish time (e.g. "Geocache Listing"). */
  name: string;
}

export interface SaveNipParams {
  identifier: string;
  title: string;
  content: string;
  kinds: NipKind[];
  /** Fork source, if creating a fork. */
  fork?:
    | { type: 'custom'; address: string; authorPubkey: string }
    | { type: 'official'; url: string };
  /** When editing, preserve fork tags from the original event. */
  original?: CustomNip;
}

/** Build the tag array for a kind-30817 custom NIP. */
export function buildNipTags(params: SaveNipParams): string[][] {
  const tags: string[][] = [
    ['d', params.identifier.trim()],
    ['title', params.title.trim()],
    ['alt', `Nostr Implementation Possibility: ${params.title.trim()}`],
    // The human-readable name lives in k[2]; relays still index the kind number.
    ...params.kinds.map(({ kind, name }) => ['k', kind, name.trim()]),
  ];

  // New fork.
  if (params.fork) {
    if (params.fork.type === 'custom') {
      tags.push(['a', params.fork.address, '', 'fork']);
      tags.push(['p', params.fork.authorPubkey]);
    } else {
      tags.push(['i', params.fork.url, 'fork']);
    }
  } else if (params.original?.fork) {
    // Preserve existing fork markers when editing.
    const f = params.original.fork;
    if (f.type === 'custom') {
      tags.push(['a', f.address, '', 'fork']);
      const p = params.original.event.tags.find(([n]) => n === 'p')?.[1];
      if (p) tags.push(['p', p]);
    } else {
      tags.push(['i', f.url, 'fork']);
    }
  }

  return tags;
}

/** Create or update a community NIP (kind 30817). */
export function useSaveNip() {
  const { mutateAsync: publish } = useNostrPublish();
  const queryClient = useQueryClient();

  return useMutation<NostrEvent, Error, SaveNipParams>({
    mutationFn: async (params) => {
      return publish({ kind: CUSTOM_NIP_KIND, content: params.content.trim(), tags: buildNipTags(params) });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['custom-nips'] });
      queryClient.invalidateQueries({ queryKey: ['custom-nip'] });
    },
  });
}

/** Request deletion of a community NIP (kind 30817) via a NIP-09 kind-5 event. */
export function useDeleteNip() {
  const { mutateAsync: publish } = useNostrPublish();
  const queryClient = useQueryClient();

  return useMutation<NostrEvent, Error, CustomNip>({
    mutationFn: async (nip) => {
      // Addressable events are deleted by their `a` coordinate, not `e`.
      return publish({
        kind: 5,
        content: '',
        tags: [
          ['a', nip.address],
          ['e', nip.event.id],
          ['k', CUSTOM_NIP_KIND.toString()],
        ],
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['custom-nips'] });
      queryClient.invalidateQueries({ queryKey: ['custom-nip'] });
    },
  });
}
