import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import {
  GIT_REPO_KIND,
  isValidRepoAnnouncement,
  parseRepoAnnouncement,
  type GitRepoAnnouncement,
} from '@/lib/git';

/**
 * NIP-50 autocomplete search over NIP-34 repository announcements (kind 30617).
 * Sent with `autocomplete:true` so partial words match while the user types —
 * the same pattern used by `useNipSearch` for community NIPs.
 */
export function useGitRepoSearch(query: string, limit = 20) {
  const { nostr } = useNostr();
  const trimmed = query.trim();

  return useQuery<GitRepoAnnouncement[]>({
    queryKey: ['git-repo-search', trimmed, limit],
    queryFn: async ({ signal }) => {
      if (!trimmed) return [];

      const events = await nostr.query(
        [{ kinds: [GIT_REPO_KIND], search: `autocomplete:true ${trimmed}`, limit }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) },
      );

      // Keep latest per (pubkey, d) address.
      const latest = new Map<string, (typeof events)[number]>();
      for (const ev of events) {
        if (!isValidRepoAnnouncement(ev)) continue;
        const d = ev.tags.find(([n]) => n === 'd')?.[1] ?? '';
        const key = `${ev.pubkey}:${d}`;
        const prev = latest.get(key);
        if (!prev || ev.created_at > prev.created_at) latest.set(key, ev);
      }

      return Array.from(latest.values()).map(parseRepoAnnouncement);
    },
    enabled: trimmed.length > 0,
    staleTime: 30 * 1000,
  });
}
