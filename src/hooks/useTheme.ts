import { useRef, useCallback } from "react";

import { type Theme } from "@/contexts/AppContext";
import { type CoreThemeColors, type ThemeConfig } from "@/themes";
import { useAppContext } from "@/hooks/useAppContext";
import { useEncryptedSettings } from "@/hooks/useEncryptedSettings";
import { usePublishTheme } from "@/hooks/usePublishTheme";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import {
  builtinThemes,
  buildThemeCssFromCore,
  resolveTheme,
  resolveThemeConfig,
} from "@/themes";

/**
 * Get and set the active theme.
 *
 * - `setTheme(theme)` switches between "light", "dark", "system", and "custom".
 * - `applyCustomTheme(config)` sets theme to "custom" and applies a ThemeConfig
 *   (or bare CoreThemeColors). Use for presets and externally-sourced themes.
 * - `setAutoShareTheme(enabled)` toggles auto-publishing of custom themes (kind 16767).
 */
export function useTheme() {
  const { config, updateConfig } = useAppContext();
  const { updateSettings } = useEncryptedSettings();
  const { setActiveTheme } = usePublishTheme();
  const { user } = useCurrentUser();
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const autoPublishTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  /** Debounced sync of theme prefs to the encrypted NIP-78 store (1s). */
  const syncToEncrypted = useCallback((patch: { theme?: Theme; customTheme?: ThemeConfig }) => {
    if (!user) return;
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      updateSettings.mutateAsync(patch).catch((error) => {
        console.error('Failed to sync theme to encrypted storage:', error);
      });
    }, 1000);
  }, [user, updateSettings]);

  /** Debounced auto-publish of the custom theme to the user's profile (kind 16767, 2s). */
  const autoPublishTheme = useCallback((themeConfig: ThemeConfig) => {
    if (!user || !config.autoShareTheme) return;
    if (autoPublishTimer.current) clearTimeout(autoPublishTimer.current);
    autoPublishTimer.current = setTimeout(() => {
      setActiveTheme({ themeConfig }).catch((error) => {
        console.error('Failed to auto-publish theme to profile:', error);
      });
    }, 2000);
  }, [user, config.autoShareTheme, setActiveTheme]);

  /** Switch to a builtin theme (light/dark/system) or to "custom". Flicker-free. */
  const setTheme = useCallback((theme: Theme) => {
    // Disable transitions while swapping the theme to prevent animated flicker.
    const noTransition = document.createElement('style');
    noTransition.textContent = '*, *::before, *::after { transition: none !important; }';
    document.head.appendChild(noTransition);

    const resolved = resolveTheme(theme);
    // Only inject derived vars for custom / configured themes; builtin light/dark
    // is owned by index.css. The provider's useLayoutEffect reconciles either way.
    if (resolved === 'custom' || config.themes) {
      const colors = resolved === 'custom'
        ? (config.customTheme?.colors ?? builtinThemes.dark)
        : resolveThemeConfig(resolved, config.themes).colors;
      let el = document.getElementById('theme-vars') as HTMLStyleElement | null;
      if (!el) {
        el = document.createElement('style');
        el.id = 'theme-vars';
        document.head.appendChild(el);
      }
      el.textContent = buildThemeCssFromCore(colors);
    } else {
      const el = document.getElementById('theme-vars');
      if (el) el.textContent = '';
    }
    document.documentElement.classList.toggle('dark', resolved === 'dark');

    requestAnimationFrame(() => noTransition.remove());

    updateConfig((currentConfig) => ({ ...currentConfig, theme }));
    syncToEncrypted({ theme });
  }, [config.themes, config.customTheme?.colors, updateConfig, syncToEncrypted]);

  /** Set theme to "custom" and apply the given config (accepts bare CoreThemeColors). */
  const applyCustomTheme = useCallback((input: ThemeConfig | CoreThemeColors) => {
    const themeConfig: ThemeConfig = 'colors' in input ? input : { colors: input };
    const normalizedConfig: ThemeConfig = {
      ...themeConfig,
      background: themeConfig.background ?? undefined,
    };

    updateConfig((currentConfig) => ({
      ...currentConfig,
      theme: 'custom' as Theme,
      customTheme: normalizedConfig,
    }));
    syncToEncrypted({ theme: 'custom', customTheme: normalizedConfig });
    autoPublishTheme(normalizedConfig);
  }, [updateConfig, syncToEncrypted, autoPublishTheme]);

  /** Toggle the autoShareTheme setting. */
  const setAutoShareTheme = useCallback((enabled: boolean) => {
    updateConfig((currentConfig) => ({ ...currentConfig, autoShareTheme: enabled }));
    if (user) {
      updateSettings.mutateAsync({ autoShareTheme: enabled }).catch((error) => {
        console.error('Failed to sync autoShareTheme to encrypted storage:', error);
      });
    }
  }, [user, updateConfig, updateSettings]);

  return {
    theme: config.theme,
    customTheme: config.customTheme,
    themes: config.themes,
    autoShareTheme: config.autoShareTheme,
    setTheme,
    applyCustomTheme,
    setAutoShareTheme,
  };
}
