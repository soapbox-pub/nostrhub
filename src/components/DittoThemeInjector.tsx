import { useEffect } from 'react';

import { useAppContext } from '@/hooks/useAppContext';
import { useActiveProfileTheme } from '@/hooks/useActiveProfileTheme';
import { coreToTokens, buildThemeVars, type ThemeConfig } from '@/themes';
import { isDarkTheme } from '@/lib/colorUtils';
import { loadAndApplyFont, loadAndApplyTitleFont } from '@/lib/fontLoader';
import { sanitizeUrl } from '@/lib/sanitizeUrl';

const VARS_STYLE_ID = 'ditto-theme-vars';
const BG_STYLE_ID = 'ditto-theme-background';

/**
 * When the "ditto" theme is active, derive CSS custom properties, fonts, and a
 * background from the user's kind 16767 active profile theme and inject them on
 * the document root. Renders nothing — side effects only.
 *
 * Switching to any other theme tears the injected styles down so NostrHub's
 * built-in light/dark palette (from index.css) takes over again.
 */
export function DittoThemeInjector() {
  const { config } = useAppContext();
  const { profileTheme } = useActiveProfileTheme();
  const active = config.theme === 'ditto' && !!profileTheme;

  // CSS variables + dark-class detection.
  useEffect(() => {
    if (!active || !profileTheme) {
      document.getElementById(VARS_STYLE_ID)?.remove();
      return;
    }

    const dark = isDarkTheme(profileTheme.colors.background);
    document.documentElement.classList.toggle('dark', dark);

    const tokens = coreToTokens(profileTheme.colors);
    let el = document.getElementById(VARS_STYLE_ID) as HTMLStyleElement | null;
    if (!el) {
      el = document.createElement('style');
      el.id = VARS_STYLE_ID;
      document.head.appendChild(el);
    }
    el.textContent = `:root { ${buildThemeVars(tokens)} }`;

    return () => {
      document.getElementById(VARS_STYLE_ID)?.remove();
    };
  }, [active, profileTheme]);

  // Fonts.
  useEffect(() => {
    if (!active || !profileTheme) {
      loadAndApplyFont(undefined);
      loadAndApplyTitleFont(undefined);
      return;
    }
    loadAndApplyFont(profileTheme.font);
    loadAndApplyTitleFont(profileTheme.titleFont);
    return () => {
      loadAndApplyFont(undefined);
      loadAndApplyTitleFont(undefined);
    };
  }, [active, profileTheme]);

  // Background image.
  useEffect(() => {
    applyBackground(active ? profileTheme : undefined);
    return () => applyBackground(undefined);
  }, [active, profileTheme]);

  return null;
}

function applyBackground(theme: ThemeConfig | undefined) {
  const url = sanitizeUrl(theme?.background?.url);
  if (!theme || !url) {
    document.getElementById(BG_STYLE_ID)?.remove();
    return;
  }

  let style = document.getElementById(BG_STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = BG_STYLE_ID;
    document.head.appendChild(style);
  }

  const dark = isDarkTheme(theme.colors.background);
  // Reuse the (now-freed) decorative pseudo-elements: ::after paints the image,
  // ::before lays a fixed scrim tinted to the theme background so foreground text
  // stays legible over busy photos. Scrim opacity is higher on dark themes.
  const scrimColor = `hsl(${theme.colors.background})`;
  const scrimOpacity = dark ? 0.62 : 0.55;

  const imageRule = theme.background?.mode === 'tile'
    ? `background-image: url("${url}"); background-repeat: repeat; background-size: auto;`
    : `background-image: url("${url}"); background-size: cover; background-repeat: no-repeat; background-position: center;`;

  style.textContent = [
    // Paint the image as a fixed full-viewport layer.
    `body::after { content: ''; display: block !important; position: fixed; inset: 0; z-index: -2; pointer-events: none; ${imageRule} opacity: 1; animation: none; }`,
    // Tint/scrim overlay on top of the image, beneath the app content.
    `body::before { content: ''; display: block !important; position: fixed; inset: 0; z-index: -1; pointer-events: none; background: ${scrimColor}; opacity: ${scrimOpacity}; }`,
  ].join('\n');
}
