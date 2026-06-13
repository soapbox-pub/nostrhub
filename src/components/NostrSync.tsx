import { useEffect, useRef } from 'react';
import { useNostr } from '@nostrify/react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAppContext } from '@/hooks/useAppContext';
import { useEncryptedSettings, setLocalSettingsSync } from '@/hooks/useEncryptedSettings';
import { parseBlossomServerList } from '@/lib/appBlossom';

/**
 * NostrSync - Syncs the user's Nostr data into AppContext when logged in.
 *
 * Syncs:
 * - BUD-03 Blossom server list (kind 10063)
 * - Encrypted app settings (kind 30078) — theme mode, experts, community cap, etc.
 *
 * Note: The NIP-65 relay list is intentionally NOT synced (locally configured only).
 * The Ditto profile theme (kind 16767) is applied live by <DittoThemeInjector/>,
 * not copied into config here.
 */
export function NostrSync() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { config, updateConfig } = useAppContext();
  const {
    settings: encryptedSettings,
    isLoading: settingsLoading,
    recentlyWritten,
  } = useEncryptedSettings();

  // ─── Blossom server list (kind 10063) ───────────────────────────────
  useEffect(() => {
    if (!user) return;

    const syncBlossomServersFromNostr = async () => {
      try {
        const events = await nostr.query(
          [{ kinds: [10063], authors: [user.pubkey], limit: 1 }],
          { signal: AbortSignal.timeout(5000) }
        );

        if (events.length > 0) {
          const event = events[0];
          if (event.created_at > config.blossomServerMetadata.updatedAt) {
            const fetchedServers = parseBlossomServerList(event);
            if (fetchedServers.length > 0) {
              console.log('Syncing Blossom server list from Nostr:', fetchedServers);
              updateConfig((current) => ({
                ...current,
                blossomServerMetadata: {
                  servers: fetchedServers,
                  updatedAt: event.created_at,
                },
              }));
            }
          }
        }
      } catch (error) {
        console.error('Failed to sync Blossom servers from Nostr:', error);
      }
    };

    syncBlossomServersFromNostr();
  }, [user, config.blossomServerMetadata.updatedAt, nostr, updateConfig]);

  // ─── Encrypted app settings (kind 30078) ────────────────────────────
  const lastSyncedTimestamp = useRef<number>(0);
  const prevPubkey = useRef<string | undefined>(undefined);
  const accountSwitched = useRef(false);

  useEffect(() => {
    const pubkey = user?.pubkey;
    if (prevPubkey.current !== undefined && pubkey !== prevPubkey.current) {
      lastSyncedTimestamp.current = 0;
      accountSwitched.current = true;
    }
    prevPubkey.current = pubkey;
  }, [user?.pubkey]);

  useEffect(() => {
    if (!user || settingsLoading) return;

    if (!encryptedSettings) {
      if (accountSwitched.current) {
        updateConfig((current) => {
          if (current.theme === 'system') return current;
          return { ...current, theme: 'system' };
        });
        accountSwitched.current = false;
      }
      return;
    }

    const remoteSync = encryptedSettings.lastSync || 0;

    if (recentlyWritten()) {
      lastSyncedTimestamp.current = remoteSync;
      return;
    }
    if (remoteSync <= lastSyncedTimestamp.current) return;

    console.log('Syncing encrypted settings from Nostr', remoteSync);
    lastSyncedTimestamp.current = remoteSync;
    const isSwitch = accountSwitched.current;
    accountSwitched.current = false;

    updateConfig((current) => {
      let changed = false;
      const updates = { ...current };

      if (encryptedSettings.theme) {
        if (encryptedSettings.theme !== current.theme) {
          updates.theme = encryptedSettings.theme;
          changed = true;
        }
      } else if (isSwitch && current.theme !== 'system') {
        updates.theme = 'system';
        changed = true;
      }

      if (
        encryptedSettings.experts &&
        JSON.stringify(encryptedSettings.experts) !== JSON.stringify(current.experts)
      ) {
        updates.experts = encryptedSettings.experts;
        changed = true;
      }

      if (
        encryptedSettings.communityCap !== undefined &&
        encryptedSettings.communityCap !== current.communityCap
      ) {
        updates.communityCap = encryptedSettings.communityCap;
        changed = true;
      }

      if (
        encryptedSettings.statsProvider &&
        encryptedSettings.statsProvider !== current.statsProvider
      ) {
        updates.statsProvider = encryptedSettings.statsProvider;
        changed = true;
      }

      if (
        encryptedSettings.useAppBlossomServers !== undefined &&
        encryptedSettings.useAppBlossomServers !== current.useAppBlossomServers
      ) {
        updates.useAppBlossomServers = encryptedSettings.useAppBlossomServers;
        changed = true;
      }

      return changed ? updates : current;
    });

    if (user && remoteSync > 0) {
      setLocalSettingsSync(user.pubkey, remoteSync);
    }
  }, [user, encryptedSettings, settingsLoading, updateConfig, recentlyWritten]);

  return null;
}
