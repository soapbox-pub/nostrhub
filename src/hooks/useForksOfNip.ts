import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';
import { CUSTOM_NIP_KIND, isValidCustomNip, parseCustomNip, type CustomNip } from '@/lib/nips';
import { nipGithubUrl, budGithubUrl } from '@/lib/apps';
import { useExperts } from '@/hooks/useExperts';
import { useCommunityAuthors } from '@/hooks/useCommunityAuthors';

/** A fork of a NIP, flagged when its author is one of the configured experts. */
export interface NipForkEntry {
  nip: CustomNip;
  byExpert: boolean;
}

/**
 * Find community forks of a NIP or BUD, expert-authored forks first.
 *
 * Forks are community NIPs (kind 30817) that reference their source with a
 * `fork` marker (see NIP.md):
 *   - Fork of a custom NIP:   `["a", "30817:<pubkey>:<d>", "", "fork"]`
 *   - Fork of an official NIP: `["i", "<github-blob-url>", "fork"]`
 *   - Fork of a BUD:           `["i", "<blossom-blob-url>", "fork"]`
 *
 * The reference tag (`#a` / `#i`) is relay-indexed, so the filter is narrow
 * without an author constraint. Results are then scoped to the community author
 * set (the same spam boundary used for comments and chat), and the `fork`
 * marker is verified client-side.
 */
function useForksOfNip(
  ref:
    | { type: 'custom'; address: string }
    | { type: 'official'; number: string }
    | { type: 'bud'; number: string }
    | undefined,
) {
  const { nostr } = useNostr();
  const { expertSet } = useExperts();
  const community = useCommunityAuthors();

  // The relay-indexed reference tag identifying this NIP as a fork source.
  const refTag: { tag: '#a' | '#i'; value: string } | undefined = ref
    ? ref.type === 'custom'
      ? { tag: '#a', value: ref.address }
      : ref.type === 'bud'
        ? { tag: '#i', value: budGithubUrl(ref.number) }
        : { tag: '#i', value: nipGithubUrl(ref.number) }
    : undefined;

  const authorSet = community.data?.authorSet;

  return useQuery<NipForkEntry[]>({
    queryKey: ['nip-forks', refTag?.tag, refTag?.value, community.dataUpdatedAt, [...expertSet].sort()],
    queryFn: async ({ signal }) => {
      const filter: NostrFilter = { kinds: [CUSTOM_NIP_KIND], limit: 200 };
      filter[refTag!.tag] = [refTag!.value];
      const events = await nostr
        .query([filter], { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) })
        .catch(() => [] as NostrEvent[]);

      // Carries the reference tag with the `fork` marker (not just any `a`/`i`).
      const isFork = (ev: NostrEvent) =>
        ev.tags.some(([n, v, c, marker]) => {
          if (refTag!.tag === '#a') {
            return n === 'a' && v === refTag!.value && marker === 'fork';
          }
          return n === 'i' && v === refTag!.value && c === 'fork';
        });

      // Keep only the latest event per (author, d) address.
      const latest = new Map<string, NostrEvent>();
      for (const ev of events) {
        if (!isValidCustomNip(ev)) continue;
        if (!expertSet.has(ev.pubkey) && !authorSet?.has(ev.pubkey)) continue;
        if (!isFork(ev)) continue;
        const d = ev.tags.find(([n]) => n === 'd')?.[1] ?? '';
        const key = `${ev.pubkey}:${d}`;
        const prev = latest.get(key);
        if (!prev || ev.created_at > prev.created_at) latest.set(key, ev);
      }

      return Array.from(latest.values())
        .map((ev) => ({ nip: parseCustomNip(ev), byExpert: expertSet.has(ev.pubkey) }))
        .sort((a, b) => Number(b.byExpert) - Number(a.byExpert) || b.nip.createdAt - a.nip.createdAt);
    },
    enabled: Boolean(refTag) && !!authorSet,
    staleTime: 5 * 60 * 1000,
  });
}

/** Community forks of a community NIP (by `30817:<pubkey>:<d>` address). */
export function useForksOfCustomNip(address: string | undefined) {
  return useForksOfNip(address ? { type: 'custom', address } : undefined);
}

/** Community forks of an official NIP (by number, e.g. "01"). */
export function useForksOfOfficialNip(number: string | undefined) {
  return useForksOfNip(number ? { type: 'official', number } : undefined);
}

/** Community forks of a Blossom BUD (by number, e.g. "01"). */
export function useForksOfBud(number: string | undefined) {
  return useForksOfNip(number ? { type: 'bud', number } : undefined);
}
