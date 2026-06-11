import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { useAppContext } from '@/hooks/useAppContext';
import {
  GIT_DISCOVERY_RELAYS,
  GIT_REPO_KIND,
  isValidRepoAnnouncement,
  parseRepoAnnouncement,
  type GitRepoAnnouncement,
} from '@/lib/git';

export interface UseGitReposOptions {
  /** Restrict to a `t` hashtag (relay-side `#t` filter). */
  hashtag?: string;
  limit?: number;
}

/**
 * Discover NIP-34 repository announcements (kind 30617), newest first.
 *
 * Queries well-known GRASP relays alongside the user's read relays, since git
 * announcements rarely propagate to general-purpose relays. Keeps only the
 * latest announcement per (author, identifier) address.
 */
export function useGitRepos(options: UseGitReposOptions = {}) {
  const { nostr } = useNostr();
  const { config } = useAppContext();
  const { hashtag, limit = 150 } = options;

  return useQuery<GitRepoAnnouncement[]>({
    queryKey: ['git-repos', hashtag ?? null, limit],
    queryFn: async ({ signal }) => {
      const readRelays = config.relayMetadata.relays
        .filter((r) => r.read)
        .map((r) => r.url);

      const urls = new Set<string>([...GIT_DISCOVERY_RELAYS, ...readRelays]);

      const filter: { kinds: number[]; limit: number; '#t'?: string[] } = {
        kinds: [GIT_REPO_KIND],
        limit,
      };
      if (hashtag) filter['#t'] = [hashtag.toLowerCase()];

      const events = await nostr.group([...urls].slice(0, 10)).query([filter], {
        signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
      });

      // Addressable events: keep only the latest per (pubkey, d) address.
      const latest = new Map<string, (typeof events)[number]>();
      for (const ev of events) {
        if (!isValidRepoAnnouncement(ev)) continue;
        const d = ev.tags.find(([n]) => n === 'd')?.[1] ?? '';
        const key = `${ev.pubkey}:${d}`;
        const prev = latest.get(key);
        if (!prev || ev.created_at > prev.created_at) latest.set(key, ev);
      }

      return Array.from(latest.values())
        .map(parseRepoAnnouncement)
        .sort((a, b) => b.createdAt - a.createdAt);
    },
    staleTime: 60 * 1000,
  });
}
