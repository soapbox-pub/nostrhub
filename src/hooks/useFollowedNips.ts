import { useCallback, useMemo } from 'react';
import { useEncryptedSettings } from '@/hooks/useEncryptedSettings';
import { budGithubUrl, nipGithubUrl } from '@/lib/apps';
import type { FollowedNip } from '@/lib/schemas';
import type { NipTarget } from '@/hooks/useNipApprovals';

/**
 * The string stored for a followed NIP: the address coordinate of a community
 * NIP, or the canonical GitHub blob URL of an official NIP / BUD. These are the
 * same values other events reference the NIP by (`a`/`A` and `i`/`I` tags), so
 * notification queries can filter on them directly.
 */
export function followTarget(target: NipTarget): string {
  if (target.type === 'custom') return target.address;
  if (target.type === 'bud') return budGithubUrl(target.number);
  return nipGithubUrl(target.number);
}

/**
 * NIPs the user follows, stored privately in the encrypted settings event
 * (kind 30078) so the list syncs across devices without being public.
 */
export function useFollowedNips() {
  const { settings, updateSettings } = useEncryptedSettings();

  const followed = useMemo<FollowedNip[]>(() => settings?.followedNips ?? [], [settings?.followedNips]);

  const isFollowing = useCallback(
    (target: NipTarget) => {
      const value = followTarget(target);
      return followed.some((f) => f.target === value);
    },
    [followed],
  );

  const setFollowing = useCallback(
    async (target: NipTarget, follow: boolean) => {
      const value = followTarget(target);
      const rest = followed.filter((f) => f.target !== value);
      const next = follow ? [...rest, { target: value, since: Math.floor(Date.now() / 1000) }] : rest;
      await updateSettings.mutateAsync({ followedNips: next });
    },
    [followed, updateSettings],
  );

  return { followed, isFollowing, setFollowing, isPending: updateSettings.isPending };
}
