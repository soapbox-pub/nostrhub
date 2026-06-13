import { useQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';

import { ACTIVE_THEME_KIND, parseActiveProfileTheme, type ActiveProfileTheme } from '@/lib/themeEvent';

/**
 * Query a user's active profile theme (kind 16767, replaceable). Filtered by
 * `authors` so only the owner's own theme is trusted (a replaceable event's
 * author is its trust boundary).
 */
export function useActiveProfileTheme(pubkey: string | undefined) {
  const { nostr } = useNostr();

  return useQuery<ActiveProfileTheme | null>({
    queryKey: ['active-profile-theme', pubkey],
    queryFn: async ({ signal }) => {
      if (!pubkey) return null;
      const events = await nostr.query(
        [{ kinds: [ACTIVE_THEME_KIND], authors: [pubkey], limit: 1 }],
        { signal },
      );
      if (events.length === 0) return null;
      return parseActiveProfileTheme(events[0]);
    },
    enabled: !!pubkey,
    staleTime: 5 * 60 * 1000,
  });
}
