import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';
import { APP_HANDLER_KIND, dedupeAppEvents, type AppInfo } from '@/lib/apps';

/**
 * Find NIP-89 app listings (kind 31990) that reference a NIP-34 git repository
 * via an `a` tag:
 *   `["a", "30617:<pubkey>:<d>", "<relay>"]`
 *
 * The kind prefix "30617:" in the address uniquely identifies these as repo
 * references, so no extra marker is needed.
 */
export function useAppsForRepo(repoAddress: string | undefined) {
  const { nostr } = useNostr();

  return useQuery<AppInfo[]>({
    queryKey: ['apps-for-repo', repoAddress],
    queryFn: async ({ signal }) => {
      const events = await nostr
        .query(
          [{ kinds: [APP_HANDLER_KIND], '#a': [repoAddress!], limit: 50 }],
          { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) },
        )
        .catch(() => [] as NostrEvent[]);

      // Confirm exact address match.
      const filtered = events.filter((ev) =>
        ev.tags.some(([n, v]) => n === 'a' && v === repoAddress),
      );

      return dedupeAppEvents(filtered);
    },
    enabled: Boolean(repoAddress),
    staleTime: 5 * 60 * 1000,
  });
}
