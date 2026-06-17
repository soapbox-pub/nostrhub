import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';
import { CUSTOM_NIP_KIND, isValidCustomNip, parseCustomNip, type CustomNip } from '@/lib/nips';
import { nipGithubUrl } from '@/lib/apps';
import { useExperts } from '@/hooks/useExperts';

/**
 * Find expert-authored forks of a NIP.
 *
 * Forks are community NIPs (kind 30817) that reference their source with a
 * `fork` marker (see NIP.md):
 *   - Fork of a custom NIP:   `["a", "30817:<pubkey>:<d>", "", "fork"]`
 *   - Fork of an official NIP: `["i", "<github-blob-url>", "fork"]`
 *
 * We constrain the relay query to the configured expert author set — a fork
 * by an expert is a meaningful signal, the same trust boundary used for NIP
 * approvals and ranking. The reference tag (`#a` / `#i`) is relay-indexed, so
 * the filter is efficient; we then client-verify the `fork` marker.
 */
function useForksOfNip(
  ref: { type: 'custom'; address: string } | { type: 'official'; number: string } | undefined,
) {
  const { nostr } = useNostr();
  const { experts, expertSet } = useExperts();

  // The relay-indexed reference tag identifying this NIP as a fork source.
  const refTag: { tag: '#a' | '#i'; value: string } | undefined = ref
    ? ref.type === 'custom'
      ? { tag: '#a', value: ref.address }
      : { tag: '#i', value: nipGithubUrl(ref.number) }
    : undefined;

  const sortedExperts = [...experts].sort();

  return useQuery<CustomNip[]>({
    queryKey: ['nip-forks', refTag?.tag, refTag?.value, sortedExperts],
    queryFn: async ({ signal }) => {
      const filter: NostrFilter = {
        kinds: [CUSTOM_NIP_KIND],
        authors: experts,
        limit: 100,
      };
      filter[refTag!.tag] = [refTag!.value];
      const events = await nostr
        .query([filter], { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) })
        .catch(() => [] as NostrEvent[]);

      // Verify each event is a valid custom NIP, is authored by an expert, and
      // carries the reference tag with the `fork` marker (not just any `a`/`i`).
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
        if (!expertSet.has(ev.pubkey)) continue;
        if (!isFork(ev)) continue;
        const d = ev.tags.find(([n]) => n === 'd')?.[1] ?? '';
        const key = `${ev.pubkey}:${d}`;
        const prev = latest.get(key);
        if (!prev || ev.created_at > prev.created_at) latest.set(key, ev);
      }

      return Array.from(latest.values())
        .map(parseCustomNip)
        .sort((a, b) => b.createdAt - a.createdAt);
    },
    enabled: Boolean(refTag) && experts.length > 0,
    staleTime: 5 * 60 * 1000,
  });
}

/** Expert-authored forks of a community NIP (by `30817:<pubkey>:<d>` address). */
export function useForksOfCustomNip(address: string | undefined) {
  return useForksOfNip(address ? { type: 'custom', address } : undefined);
}

/** Expert-authored forks of an official NIP (by number, e.g. "01"). */
export function useForksOfOfficialNip(number: string | undefined) {
  return useForksOfNip(number ? { type: 'official', number } : undefined);
}
