import { useNostr } from '@nostrify/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import {
  DRAFT_WRAP_KIND,
  draftExpiration,
  newDraftSlug,
  parseDraft,
  type Draft,
  type DraftEventTemplate,
} from '@/lib/drafts';

const DRAFTS_QUERY_KEY = 'drafts';

/**
 * Slugs deleted this session, scoped per-pubkey. A NIP-37 deletion (blank
 * content) can take a few seconds to propagate and index, so a refetch fired
 * right after deleting may still return the old draft. We suppress these slugs
 * from query results until the deletion lands, so an optimistically-removed
 * draft can't reappear.
 */
const recentlyDeleted = new Map<string, Set<string>>();

function markDeleted(pubkey: string, slug: string): void {
  const set = recentlyDeleted.get(pubkey) ?? new Set<string>();
  set.add(slug);
  recentlyDeleted.set(pubkey, set);
}

function unmarkDeleted(pubkey: string, slug: string): void {
  recentlyDeleted.get(pubkey)?.delete(slug);
}

function isDeleted(pubkey: string, slug: string): boolean {
  return recentlyDeleted.get(pubkey)?.has(slug) ?? false;
}

export interface SaveDraftParams {
  /** The unsigned event to stash (exactly what would be published). */
  template: DraftEventTemplate;
  /** Existing draft slug to overwrite; omit to create a new draft. */
  slug?: string;
}

export interface SaveDraftResult {
  slug: string;
  event: NostrEvent;
}

/**
 * NIP-37 encrypted draft management (kind 31234).
 *
 * Drafts wrap an unsigned NIP (30817) or article (30023) event, NIP-44-encrypted
 * to the author's own pubkey, so unfinished work syncs privately across the
 * user's devices and can be resumed later. Each draft has a unique `d` tag, so a
 * user can keep several drafts at once.
 */
export function useDrafts() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();
  const { mutateAsync: publish } = useNostrPublish();

  const hasNip44 = !!user?.signer.nip44;

  // ── Query: load + decrypt all of the user's draft wraps ────────────────
  const list = useQuery<Draft[]>({
    queryKey: [DRAFTS_QUERY_KEY, user?.pubkey],
    enabled: !!user && hasNip44,
    staleTime: 60_000,
    queryFn: async ({ signal }) => {
      if (!user?.signer.nip44) return [];

      const opts = { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) };
      const events = await nostr.query(
        [{ kinds: [DRAFT_WRAP_KIND], authors: [user.pubkey], limit: 100 }],
        opts,
      );

      // Keep only the latest wrapper per `d` tag (addressable semantics).
      const latest = new Map<string, NostrEvent>();
      for (const ev of events) {
        const d = ev.tags.find(([n]) => n === 'd')?.[1];
        if (!d) continue;
        const prev = latest.get(d);
        if (!prev || ev.created_at > prev.created_at) latest.set(d, ev);
      }

      const drafts: Draft[] = [];
      for (const ev of latest.values()) {
        // Blank content = deleted per NIP-37.
        if (!ev.content.trim()) continue;
        const d = ev.tags.find(([n]) => n === 'd')?.[1];
        // Suppress drafts deleted this session whose deletion may not have
        // propagated to the relay yet, so they don't resurrect on refetch.
        if (d && isDeleted(user.pubkey, d)) continue;
        try {
          const plaintext = await user.signer.nip44.decrypt(user.pubkey, ev.content);
          const draft = parseDraft(ev, plaintext);
          if (draft) drafts.push(draft);
        } catch (err) {
          console.warn('[useDrafts] Failed to decrypt draft:', err);
        }
      }

      return drafts.sort((a, b) => b.updatedAt - a.updatedAt);
    },
  });

  // ── Mutation: save (create or overwrite) a draft ───────────────────────
  const save = useMutation<SaveDraftResult, Error, SaveDraftParams>({
    mutationFn: async ({ template, slug: existingSlug }) => {
      if (!user) throw new Error('You must be logged in to save a draft');
      if (!user.signer.nip44) {
        throw new Error('Your signer does not support NIP-44 encryption, which is required for drafts');
      }

      const slug = existingSlug || newDraftSlug();
      const plaintext = JSON.stringify(template);
      const encrypted = await user.signer.nip44.encrypt(user.pubkey, plaintext);

      const event = await publish({
        kind: DRAFT_WRAP_KIND,
        content: encrypted,
        tags: [
          ['d', slug],
          ['k', String(template.kind)],
          ['expiration', String(draftExpiration())],
        ],
      });

      return { slug, event };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [DRAFTS_QUERY_KEY, user?.pubkey] });
    },
  });

  // ── Mutation: delete a draft (blank the content per NIP-37) ────────────
  const remove = useMutation<void, Error, { slug: string }, { previous?: Draft[] }>({
    mutationFn: async ({ slug }) => {
      if (!user) throw new Error('You must be logged in');

      // Blank-content kind 31234 with the same `d` replaces the draft and
      // signals deletion per NIP-37.
      await publish({
        kind: DRAFT_WRAP_KIND,
        content: '',
        tags: [['d', slug]],
      });
    },
    onMutate: async ({ slug }) => {
      const key = [DRAFTS_QUERY_KEY, user?.pubkey];
      // Stop in-flight refetches from clobbering the optimistic state.
      await queryClient.cancelQueries({ queryKey: key });

      // Suppress this slug so a stale relay refetch can't resurrect it before
      // the deletion propagates.
      if (user) markDeleted(user.pubkey, slug);

      const previous = queryClient.getQueryData<Draft[]>(key);
      // Optimistically drop it from the list.
      queryClient.setQueryData<Draft[]>(key, (old) => (old ?? []).filter((d) => d.slug !== slug));

      return { previous };
    },
    onError: (_err, { slug }, context) => {
      // Roll back: restore the list and let the draft resurface.
      if (user) unmarkDeleted(user.pubkey, slug);
      if (context?.previous) {
        queryClient.setQueryData<Draft[]>([DRAFTS_QUERY_KEY, user?.pubkey], context.previous);
      }
    },
    onSettled: () => {
      // Reconcile with the relay. Deleted slugs stay suppressed via the
      // `recentlyDeleted` guard until their blank-content event indexes.
      queryClient.invalidateQueries({ queryKey: [DRAFTS_QUERY_KEY, user?.pubkey] });
    },
  });

  return {
    /** All of the current user's drafts (newest first). */
    drafts: list,
    /** Save a draft (create new, or overwrite when `slug` is supplied). */
    saveDraft: save,
    /** Delete a draft by slug. */
    deleteDraft: remove,
    /** Whether the current signer can encrypt drafts. */
    hasNip44Support: hasNip44,
  };
}

/** Look up a single draft by slug from the cached/loaded list. */
export function findDraft(drafts: Draft[] | undefined, slug: string | null): Draft | undefined {
  if (!slug || !drafts) return undefined;
  return drafts.find((d) => d.slug === slug);
}
