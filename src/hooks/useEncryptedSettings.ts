import { useRef } from 'react';
import { useNostr } from '@nostrify/react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { NostrFilter } from '@nostrify/nostrify';

import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from './useCurrentUser';
import { fetchFreshEvent } from '@/lib/fetchFreshEvent';
import { EncryptedSettingsSchema, type EncryptedSettings } from '@/lib/schemas';

export type { EncryptedSettings };

/**
 * Timestamp (ms) of the last local encrypted-settings write this session.
 * NostrSync uses this to avoid overwriting a local edit with a stale relay event.
 */
let lastWriteTs = 0;

/** Per-pubkey localStorage mirror of the last sync timestamp, so reloads can render immediately. */
export function getLocalSettingsSync(pubkey: string): number {
  try {
    return Number(localStorage.getItem(`nostrhub:settings-lastSync:${pubkey}`)) || 0;
  } catch {
    return 0;
  }
}

export function setLocalSettingsSync(pubkey: string, lastSync: number): void {
  try {
    localStorage.setItem(`nostrhub:settings-lastSync:${pubkey}`, String(lastSync));
  } catch {
    // localStorage may be unavailable
  }
}

/**
 * Manage all cross-device app settings via an encrypted NIP-78 (kind 30078)
 * event. The settings JSON is encrypted to self with NIP-44, keeping it private
 * while syncing across the user's devices.
 *
 * The `d` tag is namespaced as `<appId>/metadata` so multiple apps can coexist
 * on the same pubkey.
 */
export function useEncryptedSettings() {
  const { config } = useAppContext();
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();

  const dTag = `${config.appId}/metadata`;

  // Query the encrypted settings event.
  const query = useQuery({
    queryKey: ['encryptedSettings', user?.pubkey],
    queryFn: async ({ signal }) => {
      if (!user) return null;
      const filter: NostrFilter = {
        kinds: [30078],
        authors: [user.pubkey],
        '#d': [dTag],
        limit: 1,
      };
      const events = await nostr.query([filter], { signal });
      return events[0] ?? null;
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    gcTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: false,
  });

  // Decrypt + parse the settings from the event content.
  const settings = useQuery({
    queryKey: ['parsedSettings', query.data?.id],
    queryFn: async () => {
      const event = query.data;
      if (!event || !user) return null;
      if (!event.content || !user.signer.nip44) return null;

      try {
        const decrypted = await user.signer.nip44.decrypt(user.pubkey, event.content);
        const json = JSON.parse(decrypted);
        const result = EncryptedSettingsSchema.safeParse(json);
        if (!result.success) {
          console.warn('Encrypted settings failed validation, using partial data:', result.error.issues);
          return (json ?? {}) as EncryptedSettings;
        }
        return result.data as EncryptedSettings;
      } catch (error) {
        console.error('Failed to decrypt settings:', error);
        return null;
      }
    },
    enabled: !!query.data && !!user,
    staleTime: 0,
    gcTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  // Latest optimistic settings, so rapid successive mutations don't read stale cache.
  const pendingSettings = useRef<EncryptedSettings | null>(null);

  const updateSettings = useMutation({
    mutationFn: async (patch: Partial<EncryptedSettings>) => {
      if (!user) throw new Error('User not logged in');
      if (!user.signer.nip44) throw new Error('NIP-44 encryption not supported by signer');

      // Merge onto the freshest known state to avoid cross-device clobbering.
      let currentSettings: EncryptedSettings;
      if (pendingSettings.current) {
        currentSettings = pendingSettings.current;
      } else {
        const freshEvent = await fetchFreshEvent(nostr, {
          kinds: [30078],
          authors: [user.pubkey],
          '#d': [dTag],
        });
        if (freshEvent?.content) {
          try {
            const decrypted = await user.signer.nip44.decrypt(user.pubkey, freshEvent.content);
            const json = JSON.parse(decrypted);
            const result = EncryptedSettingsSchema.safeParse(json);
            currentSettings = result.success ? (result.data as EncryptedSettings) : ((json ?? {}) as EncryptedSettings);
          } catch {
            currentSettings = settings.data ?? {};
          }
        } else {
          currentSettings = settings.data ?? {};
        }
      }

      const updatedSettings: EncryptedSettings = {
        ...currentSettings,
        ...patch,
        lastSync: Date.now(),
      };

      pendingSettings.current = updatedSettings;

      const plaintext = JSON.stringify(updatedSettings);
      const encrypted = await user.signer.nip44.encrypt(user.pubkey, plaintext);

      const unsignedEvent = {
        kind: 30078,
        content: encrypted,
        tags: [
          ['d', dTag],
          ['title', `${config.appName} Settings`],
          ['client', config.appName],
        ],
        created_at: Math.floor(Date.now() / 1000),
      };

      const signedEvent = await user.signer.signEvent(unsignedEvent);

      // Mark the write so NostrSync doesn't fight us.
      lastWriteTs = Date.now();

      // Publish in the background.
      nostr.event(signedEvent, { signal: AbortSignal.timeout(5000) }).catch((error) => {
        console.error('Failed to publish encrypted settings:', error);
      });

      return { updatedSettings, signedEvent };
    },
    // Update the cache in place rather than invalidating, which would trigger a
    // relay refetch that could return the old event before the new one propagates.
    onSuccess: ({ updatedSettings, signedEvent }) => {
      queryClient.setQueryData(['encryptedSettings', user?.pubkey], signedEvent);
      queryClient.setQueryData(['parsedSettings', signedEvent.id], updatedSettings);
      pendingSettings.current = null;
      if (user && updatedSettings.lastSync) {
        setLocalSettingsSync(user.pubkey, updatedSettings.lastSync);
      }
    },
  });

  /** Initialize settings if they don't yet exist. */
  const initializeSettings = async (initialSettings: Partial<EncryptedSettings>) => {
    if (settings.data !== null || !user?.signer.nip44) return;
    try {
      await updateSettings.mutateAsync(initialSettings);
    } catch (error) {
      console.warn('Failed to initialize encrypted settings:', error);
    }
  };

  return {
    settings: settings.data,
    isLoading: query.isLoading || settings.isLoading,
    isError: query.isError || settings.isError,
    error: query.error || settings.error,
    updateSettings,
    initializeSettings,
    hasNip44Support: !!user?.signer.nip44,
    lastSync: settings.data?.lastSync,
    /** True if a local write happened within the last 10s; NostrSync should skip applying. */
    recentlyWritten: () => Date.now() - lastWriteTs < 10_000,
  };
}
