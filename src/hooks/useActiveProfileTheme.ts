import { useQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { ACTIVE_THEME_KIND, parseActiveProfileTheme } from '@/lib/themeEvent';
import type { ThemeConfig } from '@/themes';

/**
 * Query the logged-in user's Ditto active profile theme (kind 16767). This is
 * the theme the user configured in Ditto (or any compatible client); NostrHub
 * surfaces it as the "Ditto" theme option.
 *
 * Returns the parsed theme, whether one exists, and the loading state.
 */
export function useActiveProfileTheme() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();

  const query = useQuery({
    queryKey: ['active-profile-theme', user?.pubkey],
    queryFn: async ({ signal }) => {
      if (!user?.pubkey) return null;
      const events = await nostr.query(
        [{ kinds: [ACTIVE_THEME_KIND], authors: [user.pubkey], limit: 1 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) },
      );
      if (events.length === 0) return null;

      const parsed = parseActiveProfileTheme(events[0]);
      if (!parsed) return null;

      const theme: ThemeConfig = {
        colors: parsed.colors,
        ...(parsed.font && { font: parsed.font }),
        ...(parsed.titleFont && { titleFont: parsed.titleFont }),
        ...(parsed.background && { background: parsed.background }),
      };
      return theme;
    },
    enabled: !!user?.pubkey,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  return {
    profileTheme: query.data ?? undefined,
    isLoading: query.isLoading,
    hasDittoTheme: !!query.data,
  };
}
