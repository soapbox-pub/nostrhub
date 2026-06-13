import { useEffect, useRef } from 'react';
import { useNostr } from '@nostrify/react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAppContext } from '@/hooks/useAppContext';
import { useEncryptedSettings, setLocalSettingsSync } from '@/hooks/useEncryptedSettings';
import { parseBlossomServerList } from '@/lib/appBlossom';
import { ACTIVE_THEME_KIND, parseActiveProfileTheme } from '@/lib/themeEvent';
import type { ThemeConfig } from '@/themes';

/**
 * NostrSync - Syncs the user's Nostr data into AppContext when logged in.
 *
 * Syncs:
 * - BUD-03 Blossom server list (kind 10063)
 * - Encrypted app settings (kind 30078) — theme, custom theme, experts, etc.
 * - Active profile theme (kind 16767) — applied as customTheme when autoShareTheme is on
 *
 * Note: The NIP-65 relay list is intentionally NOT synced (locally configured only).
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
  const profileThemeSynced = useRef(false);

  // Reset sync state on account switch.
  useEffect(() => {
    const pubkey = user?.pubkey;
    if (prevPubkey.current !== undefined && pubkey !== prevPubkey.current) {
      lastSyncedTimestamp.current = 0;
      profileThemeSynced.current = false;
      accountSwitched.current = true;
    }
    prevPubkey.current = pubkey;
  }, [user?.pubkey]);

  useEffect(() => {
    if (!user || settingsLoading) return;

    // New user with no settings: reset theme to default so the previous user's
    // theme doesn't bleed through on account switch.
    if (!encryptedSettings) {
      if (accountSwitched.current) {
        updateConfig((current) => {
          let changed = false;
          const updates = { ...current };
          if (current.theme !== 'system') { updates.theme = 'system'; changed = true; }
          if (current.customTheme !== undefined) { updates.customTheme = undefined; changed = true; }
          return changed ? updates : current;
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
        encryptedSettings.customTheme &&
        JSON.stringify(encryptedSettings.customTheme) !== JSON.stringify(current.customTheme)
      ) {
        updates.customTheme = encryptedSettings.customTheme;
        changed = true;
      } else if (isSwitch && !encryptedSettings.customTheme && current.customTheme !== undefined) {
        updates.customTheme = undefined;
        changed = true;
      }

      if (
        encryptedSettings.autoShareTheme !== undefined &&
        encryptedSettings.autoShareTheme !== current.autoShareTheme
      ) {
        updates.autoShareTheme = encryptedSettings.autoShareTheme;
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

  // ─── Active profile theme (kind 16767) ──────────────────────────────
  useEffect(() => {
    if (!user || !config.autoShareTheme) return;
    if (profileThemeSynced.current) return;
    profileThemeSynced.current = true;

    const controller = new AbortController();

    const syncProfileTheme = async () => {
      try {
        const events = await nostr.query(
          [{ kinds: [ACTIVE_THEME_KIND], authors: [user.pubkey], limit: 1 }],
          { signal: controller.signal },
        );
        if (events.length === 0) return;

        const parsed = parseActiveProfileTheme(events[0]);
        if (!parsed) return;

        const remoteTheme: ThemeConfig = {
          colors: parsed.colors,
          ...(parsed.font && { font: parsed.font }),
          ...(parsed.titleFont && { titleFont: parsed.titleFont }),
          ...(parsed.background && { background: parsed.background }),
        };

        // Apply as customTheme without changing the active mode.
        updateConfig((current) => {
          if (JSON.stringify(current.customTheme) === JSON.stringify(remoteTheme)) {
            return current;
          }
          return { ...current, customTheme: remoteTheme };
        });
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return;
        console.error('Failed to sync active profile theme:', error);
      }
    };

    syncProfileTheme();
    return () => controller.abort();
  }, [user, config.autoShareTheme, nostr, updateConfig]);

  return null;
}
