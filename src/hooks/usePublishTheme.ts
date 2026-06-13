import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import type { ThemeConfig } from '@/themes';
import {
  ACTIVE_THEME_KIND,
  THEME_DEFINITION_KIND,
  buildActiveThemeTags,
  buildThemeDefinitionTags,
  titleToSlug,
} from '@/lib/themeEvent';

/**
 * Publish, update, and delete profile theme events:
 * - Theme definitions (kind 36767, addressable) — named, shareable themes.
 * - Active profile theme (kind 16767, replaceable) — the user's current theme.
 */
export function usePublishTheme() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();

  async function publish(kind: number, content: string, tags: string[][]) {
    if (!user) throw new Error('User not logged in');
    const tagsWithClient =
      location.protocol === 'https:' && !tags.some(([n]) => n === 'client')
        ? [...tags, ['client', location.hostname]]
        : tags;
    const event = await user.signer.signEvent({
      kind,
      content,
      tags: tagsWithClient,
      created_at: Math.floor(Date.now() / 1000),
    });
    await nostr.event(event, { signal: AbortSignal.timeout(5000) });
    return event;
  }

  /** Publish or update a kind 36767 theme definition. */
  const publishThemeDefinition = useMutation({
    mutationFn: async ({
      title,
      themeConfig,
      description,
      identifier,
    }: {
      title: string;
      themeConfig: ThemeConfig;
      description?: string;
      identifier?: string;
    }) => {
      const slug = identifier ?? titleToSlug(title);
      const tags = buildThemeDefinitionTags(slug, title, themeConfig, description);
      return publish(THEME_DEFINITION_KIND, '', tags);
    },
    onSuccess: () => {
      if (user) queryClient.invalidateQueries({ queryKey: ['user-themes', user.pubkey] });
    },
  });

  /** Set a theme as the active profile theme (kind 16767). */
  const setActiveTheme = useMutation({
    mutationFn: async ({
      themeConfig,
      sourceAuthor,
      sourceIdentifier,
      description,
    }: {
      themeConfig: ThemeConfig;
      sourceAuthor?: string;
      sourceIdentifier?: string;
      description?: string;
    }) => {
      const tags = buildActiveThemeTags(themeConfig, sourceAuthor, sourceIdentifier, description);
      return publish(ACTIVE_THEME_KIND, '', tags);
    },
    onSuccess: () => {
      if (user) queryClient.invalidateQueries({ queryKey: ['active-profile-theme', user.pubkey] });
    },
  });

  /** Delete a kind 36767 theme definition (NIP-09). */
  const deleteThemeDefinition = useMutation({
    mutationFn: async ({ identifier }: { identifier: string }) => {
      if (!user) throw new Error('User not logged in');
      const address = `${THEME_DEFINITION_KIND}:${user.pubkey}:${identifier}`;
      return publish(5, '', [['a', address]]);
    },
    onSuccess: () => {
      if (user) queryClient.invalidateQueries({ queryKey: ['user-themes', user.pubkey] });
    },
  });

  /** Clear the active profile theme by publishing an empty kind 16767 replacement. */
  const clearActiveTheme = useMutation({
    mutationFn: async () => publish(ACTIVE_THEME_KIND, '', [['alt', 'No active profile theme']]),
    onSuccess: () => {
      if (user) queryClient.invalidateQueries({ queryKey: ['active-profile-theme', user.pubkey] });
    },
  });

  return {
    publishThemeDefinition: publishThemeDefinition.mutateAsync,
    setActiveTheme: setActiveTheme.mutateAsync,
    deleteThemeDefinition: deleteThemeDefinition.mutateAsync,
    clearActiveTheme: clearActiveTheme.mutateAsync,
    isPublishing:
      publishThemeDefinition.isPending ||
      setActiveTheme.isPending ||
      deleteThemeDefinition.isPending ||
      clearActiveTheme.isPending,
  };
}
