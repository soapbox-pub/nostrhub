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
 * - NIP-65 relay list (kind 10002) — the user's personal relays. These are
 *   only *used* when `useUserRelays` is enabled, but we keep `relayMetadata`
 *   in sync so the toggle has data to merge.
 * - BUD-03 Blossom server list (kind 10063)
 * - Encrypted app settings (kind 30078) — theme mode, community cap, relay
 *   toggles, etc. (The experts list lives in its own kind 12022 event, synced
 *   directly by useExperts — not here.)
 *
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

  // ─── NIP-65 relay list (kind 10002) ─────────────────────────────────
  useEffect(() => {
    if (!user) return;

    const syncRelayListFromNostr = async () => {
      try {
        const events = await nostr.query(
          [{ kinds: [10002], authors: [user.pubkey], limit: 1 }],
          { signal: AbortSignal.timeout(5000) }
        );

        if (events.length > 0) {
          const event = events[0];
          if (event.created_at > config.relayMetadata.updatedAt) {
            const fetchedRelays = event.tags
              .filter(([name]) => name === 'r')
              .map(([, url, marker]) => ({
                url: url.replace(/\/+$/, ''),
                read: !marker || marker === 'read',
                write: !marker || marker === 'write',
              }))
              .filter((r) => {
                try {
                  new URL(r.url);
                  return true;
                } catch {
                  return false;
                }
              });

            if (fetchedRelays.length > 0) {
              console.log('Syncing relay list from Nostr:', fetchedRelays);
              updateConfig((current) => ({
                ...current,
                relayMetadata: {
                  relays: fetchedRelays,
                  updatedAt: event.created_at,
                },
              }));
            }
          }
        }
      } catch (error) {
        console.error('Failed to sync relay list from Nostr:', error);
      }
    };

    syncRelayListFromNostr();
  }, [user, config.relayMetadata.updatedAt, nostr, updateConfig]);

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
        encryptedSettings.statsRelay !== undefined &&
        encryptedSettings.statsRelay !== current.statsRelay
      ) {
        updates.statsRelay = encryptedSettings.statsRelay;
        changed = true;
      }

      if (
        encryptedSettings.searchRelays &&
        JSON.stringify(encryptedSettings.searchRelays) !== JSON.stringify(current.searchRelays)
      ) {
        updates.searchRelays = encryptedSettings.searchRelays;
        changed = true;
      }

      if (
        encryptedSettings.useAppBlossomServers !== undefined &&
        encryptedSettings.useAppBlossomServers !== current.useAppBlossomServers
      ) {
        updates.useAppBlossomServers = encryptedSettings.useAppBlossomServers;
        changed = true;
      }

      if (
        encryptedSettings.useAppRelays !== undefined &&
        encryptedSettings.useAppRelays !== current.useAppRelays
      ) {
        updates.useAppRelays = encryptedSettings.useAppRelays;
        changed = true;
      }

      if (
        encryptedSettings.useUserRelays !== undefined &&
        encryptedSettings.useUserRelays !== current.useUserRelays
      ) {
        updates.useUserRelays = encryptedSettings.useUserRelays;
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
