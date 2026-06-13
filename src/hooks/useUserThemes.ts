import { useQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';

import { THEME_DEFINITION_KIND, parseThemeDefinition, type ThemeDefinition } from '@/lib/themeEvent';

/**
 * Query all kind 36767 theme definitions published by a given user,
 * deduplicated by `d` tag (latest wins) and sorted newest-first.
 *
 * Filtered by `authors` — addressable events are author-owned, so the `d` tag
 * alone is not a trust boundary.
 */
export function useUserThemes(pubkey: string | undefined) {
  const { nostr } = useNostr();

  return useQuery<ThemeDefinition[]>({
    queryKey: ['user-themes', pubkey],
    queryFn: async ({ signal }) => {
      if (!pubkey) return [];
      const events = await nostr.query(
        [{ kinds: [THEME_DEFINITION_KIND], authors: [pubkey], limit: 100 }],
        { signal },
      );

      const byIdentifier = new Map<string, ThemeDefinition>();
      for (const event of events) {
        const parsed = parseThemeDefinition(event);
        if (!parsed) continue;
        const existing = byIdentifier.get(parsed.identifier);
        if (!existing || event.created_at > existing.event.created_at) {
          byIdentifier.set(parsed.identifier, parsed);
        }
      }

      return [...byIdentifier.values()].sort(
        (a, b) => b.event.created_at - a.event.created_at,
      );
    },
    enabled: !!pubkey,
    staleTime: 5 * 60 * 1000,
  });
}
