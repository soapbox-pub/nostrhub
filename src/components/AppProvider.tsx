import { ReactNode, useLayoutEffect, useEffect } from 'react';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { AppContext, type AppConfig, type AppContextType, type Theme } from '@/contexts/AppContext';
import {
  builtinThemes,
  buildThemeCssFromCore,
  resolveTheme,
  resolveThemeConfig,
  type ThemeConfig,
  type ThemesConfig,
} from '@/themes';
import { AppConfigSchema } from '@/lib/schemas';
import { loadAndApplyFont, loadAndApplyTitleFont } from '@/lib/fontLoader';
import { sanitizeUrl } from '@/lib/sanitizeUrl';

interface AppProviderProps {
  children: ReactNode;
  /** Application storage key */
  storageKey: string;
  /** Default app configuration */
  defaultConfig: AppConfig;
}

export function AppProvider(props: AppProviderProps) {
  const {
    children,
    storageKey,
    defaultConfig,
  } = props;

  // App configuration state with localStorage persistence.
  // The deserializer validates each top-level field individually with safeParse,
  // so a single invalid/incomplete field (e.g. a customTheme missing a key) does
  // not nuke the entire config back to defaults — valid fields are preserved.
  const [rawConfig, setConfig] = useLocalStorage<Partial<AppConfig>>(
    storageKey,
    {},
    {
      serialize: JSON.stringify,
      deserialize: (value: string) => {
        const parsed = JSON.parse(value);
        if (typeof parsed !== 'object' || parsed === null) return {};

        const result: Partial<AppConfig> = {};
        for (const key of Object.keys(parsed)) {
          const fieldSchema = AppConfigSchema.shape[key as keyof typeof AppConfigSchema.shape];
          if (fieldSchema) {
            const fieldResult = fieldSchema.safeParse(parsed[key]);
            if (fieldResult.success) {
              (result as Record<string, unknown>)[key] = fieldResult.data;
            }
          }
        }
        return result;
      }
    }
  );

  // Generic config updater with callback pattern
  const updateConfig = (updater: (currentConfig: Partial<AppConfig>) => Partial<AppConfig>) => {
    setConfig(updater);
  };

  const config = { ...defaultConfig, ...rawConfig };

  const appContextValue: AppContextType = {
    config,
    updateConfig,
  };

  // Apply theme effects to the document.
  useApplyTheme(config.theme, config.customTheme, config.themes);
  useApplyFonts(config.theme, config.customTheme, config.themes);
  useApplyBackground(config.theme, config.customTheme, config.themes);

  return (
    <AppContext.Provider value={appContextValue}>
      {children}
    </AppContext.Provider>
  );
}

/**
 * Apply theme color tokens to the document root via an injected <style> tag.
 * - "system" resolves to "light"/"dark" via prefers-color-scheme (with a live listener).
 * - "custom" derives tokens from `customTheme.colors`.
 * - "light"/"dark" use configured themes if present, otherwise the builtin themes.
 *
 * For builtin light/dark/system modes we do NOT inject a token override — the
 * hand-authored palette in `src/index.css` (with its bespoke forest background)
 * is used directly via the `.dark` / `:root` classes. The override is only
 * injected for derived themes (custom, or a configured `themes` entry).
 */
function useApplyTheme(theme: Theme, customTheme: ThemeConfig | undefined, themes: ThemesConfig | undefined) {
  useLayoutEffect(() => {
    function apply() {
      const resolved = resolveTheme(theme);
      const el = ensureThemeVarsEl();

      // Builtin light/dark with no runtime override → use index.css palette.
      if (resolved !== 'custom' && !themes) {
        el.textContent = '';
        document.documentElement.classList.toggle('dark', resolved === 'dark');
        return;
      }

      const colors = resolved === 'custom'
        ? (customTheme?.colors ?? builtinThemes.dark)
        : resolveThemeConfig(resolved, themes).colors;

      el.textContent = buildThemeCssFromCore(colors);
      // Keep the `.dark` class in sync with the derived background luminance so
      // that `dark:` utility variants resolve correctly under custom themes.
      const isDark = resolved === 'custom'
        ? isDarkColors(colors.background)
        : resolved === 'dark';
      document.documentElement.classList.toggle('dark', isDark);
    }

    apply();

    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      mq.addEventListener('change', apply);
      return () => mq.removeEventListener('change', apply);
    }
  }, [theme, customTheme, themes]);
}

function ensureThemeVarsEl(): HTMLStyleElement {
  let el = document.getElementById('theme-vars') as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement('style');
    el.id = 'theme-vars';
    document.head.appendChild(el);
  }
  return el;
}

/** Lightweight dark detection on a bare HSL background string. */
function isDarkColors(backgroundHsl: string): boolean {
  const l = Number(backgroundHsl.trim().split(/\s+/)[2]?.replace('%', ''));
  return Number.isFinite(l) ? l < 28 : true;
}

/**
 * Load and apply custom body/title fonts when the active theme config changes.
 */
function useApplyFonts(theme: Theme, customTheme: ThemeConfig | undefined, themes: ThemesConfig | undefined) {
  const resolved = resolveTheme(theme);
  const activeConfig = resolved === 'custom' ? customTheme : resolveThemeConfig(resolved, themes);
  const fontFamily = activeConfig?.font?.family;
  const fontUrl = activeConfig?.font?.url;
  const titleFontFamily = activeConfig?.titleFont?.family;
  const titleFontUrl = activeConfig?.titleFont?.url;

  useEffect(() => {
    loadAndApplyFont(fontFamily ? { family: fontFamily, url: fontUrl } : undefined);
  }, [fontFamily, fontUrl]);

  useEffect(() => {
    loadAndApplyTitleFont(titleFontFamily ? { family: titleFontFamily, url: titleFontUrl } : undefined);
  }, [titleFontFamily, titleFontUrl]);
}

const BG_STYLE_ID = 'theme-background';

/**
 * Apply or remove a background image when the active theme config changes.
 * When a theme supplies a background, it overrides NostrHub's default forest
 * backdrop (the `body::after` layer in index.css) by painting on `body` itself.
 */
function useApplyBackground(theme: Theme, customTheme: ThemeConfig | undefined, themes: ThemesConfig | undefined) {
  const resolved = resolveTheme(theme);
  const activeConfig = resolved === 'custom' ? customTheme : resolveThemeConfig(resolved, themes);
  // Sanitize the event-/config-sourced URL before interpolating into CSS (https-only).
  const bgUrl = sanitizeUrl(activeConfig?.background?.url);
  const bgMode = activeConfig?.background?.mode ?? 'cover';

  useEffect(() => {
    if (!bgUrl) {
      document.getElementById(BG_STYLE_ID)?.remove();
      return;
    }

    let style = document.getElementById(BG_STYLE_ID) as HTMLStyleElement | null;
    if (!style) {
      style = document.createElement('style');
      style.id = BG_STYLE_ID;
      document.head.appendChild(style);
    }

    // Hide the default forest decorative layers and paint the theme background.
    const base = `body::before, body::after { display: none !important; }`;
    const bg = bgMode === 'tile'
      ? `body { background-image: url("${bgUrl}"); background-repeat: repeat; background-size: auto; }`
      : `body { background-image: url("${bgUrl}"); background-size: cover; background-repeat: no-repeat; background-position: center; background-attachment: fixed; }`;
    style.textContent = `${base} ${bg}`;

    return () => {
      document.getElementById(BG_STYLE_ID)?.remove();
    };
  }, [bgUrl, bgMode]);
}
