import { useRef, useCallback } from "react";

import { type Theme } from "@/contexts/AppContext";
import { useAppContext } from "@/hooks/useAppContext";
import { useEncryptedSettings } from "@/hooks/useEncryptedSettings";
import { useCurrentUser } from "@/hooks/useCurrentUser";

/**
 * Get and set the active theme mode: "light", "dark", "system", or "ditto".
 *
 * The "ditto" mode applies the user's Ditto profile theme (kind 16767); it is
 * only meaningful when the user has published one (see useActiveProfileTheme).
 * The chosen mode is debounce-synced to the encrypted NIP-78 settings event.
 */
export function useTheme(): { theme: Theme; setTheme: (theme: Theme) => void } {
  const { config, updateConfig } = useAppContext();
  const { updateSettings } = useEncryptedSettings();
  const { user } = useCurrentUser();
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const setTheme = useCallback((theme: Theme) => {
    updateConfig((currentConfig) => ({ ...currentConfig, theme }));

    if (!user) return;
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      updateSettings.mutateAsync({ theme }).catch((error) => {
        console.error('Failed to sync theme to encrypted storage:', error);
      });
    }, 1000);
  }, [user, updateConfig, updateSettings]);

  return { theme: config.theme, setTheme };
}
