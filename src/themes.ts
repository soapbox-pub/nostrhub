import type { Theme } from '@/contexts/AppContext';
import { deriveTokensFromCore } from '@/lib/colorUtils';

/**
 * The 3 core colors that define a theme.
 * All other CSS tokens are derived automatically from these.
 */
export interface CoreThemeColors {
  /** Background color (bare HSL string, e.g. "228 20% 10%") */
  background: string;
  /** Text/foreground color */
  text: string;
  /** Primary accent color (buttons, links, focus rings) */
  primary: string;
}

// ─── Font Types ───────────────────────────────────────────────────────

/** A font reference: family name + optional URL (URL required on Nostr events, optional locally for bundled fonts). */
export interface ThemeFont {
  /** CSS font-family name, e.g. "Space Grotesk" */
  family: string;
  /** Direct URL to a font file (.woff2, .ttf, .otf). Required on Nostr events, optional locally. */
  url?: string;
}

// ─── Background Types ─────────────────────────────────────────────────

/** Background image/video configuration. */
export interface ThemeBackground {
  /** URL to an image or video file */
  url: string;
  /** Display mode */
  mode?: 'cover' | 'tile';
  /** Dimensions as "widthxheight", e.g. "1920x1080" */
  dimensions?: string;
  /** MIME type, e.g. "image/jpeg" */
  mimeType?: string;
  /** Blurhash placeholder for progressive loading */
  blurhash?: string;
}

// ─── ThemeConfig ──────────────────────────────────────────────────────

/**
 * Complete theme configuration. Wraps CoreThemeColors with optional
 * font and background settings. This is the canonical type stored in
 * AppConfig.customTheme, EncryptedSettings, and theme events.
 */
export interface ThemeConfig {
  /** Theme name (stored locally AND on events) */
  title?: string;
  /** The 3 core colors */
  colors: CoreThemeColors;
  /** Optional custom font (applies globally to all text) */
  font?: ThemeFont;
  /** Optional title/header font (applies to display headings) */
  titleFont?: ThemeFont;
  /** Optional background media */
  background?: ThemeBackground;
}

/**
 * Configured light and dark themes. When set in AppConfig,
 * these override the builtin themes for "light" and "dark" modes.
 */
export interface ThemesConfig {
  /** Theme config applied when theme resolves to "light". */
  light: ThemeConfig;
  /** Theme config applied when theme resolves to "dark". */
  dark: ThemeConfig;
}

/**
 * Full set of CSS token values used by NostrHub's CSS. Every value is a
 * complete `hsl(...)` string. Derived from CoreThemeColors via
 * deriveTokensFromCore(). The keys are camelCase; toThemeVar() maps them to
 * the kebab-case `--custom-property` names used in `src/index.css`.
 */
export interface ThemeTokens {
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  popover: string;
  popoverForeground: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  nebula: string;
  destructive: string;
  destructiveForeground: string;
  border: string;
  input: string;
  ring: string;
  chart1: string;
  chart2: string;
  chart3: string;
  chart4: string;
  chart5: string;
  sidebar: string;
  sidebarForeground: string;
  sidebarPrimary: string;
  sidebarPrimaryForeground: string;
  sidebarAccent: string;
  sidebarAccentForeground: string;
  sidebarBorder: string;
  sidebarRing: string;
}

/**
 * Builtin themes whose colors are defined at build time. These match the
 * hand-authored light/dark palette in `src/index.css` (mushroom red + forest
 * purple), expressed as the 3 core colors.
 */
export const builtinThemes: Record<'light' | 'dark', CoreThemeColors> = {
  light: {
    background: '0 0% 100%',
    text: '0 10% 12%',
    primary: '0 72% 51%',
  },

  dark: {
    background: '280 12% 5%',
    text: '40 20% 95%',
    primary: '0 80% 62%',
  },
};

/** Metadata for a theme preset. */
export interface ThemePreset {
  /** Display label. */
  label: string;
  /** Emoji shown in compact theme pickers (dropdowns, cycle buttons). */
  emoji: string;
  /** Whether to show in compact pickers. All presets appear in settings. */
  featured?: boolean;
  /** The 3 core colors. */
  colors: CoreThemeColors;
  /** Optional custom font for this preset. */
  font?: ThemeFont;
  /** Optional title/header font for this preset. */
  titleFont?: ThemeFont;
  /** Optional background for this preset. */
  background?: ThemeBackground;
}

/**
 * Custom theme presets. Applying a preset sets theme to "custom"
 * and applies the preset's core color values to customTheme.
 */
export const themePresets: Record<string, ThemePreset> = {
  mushroom: {
    label: 'Mushroom Grove',
    emoji: '🍄',
    featured: true,
    colors: {
      background: '280 12% 5%',
      text: '40 20% 95%',
      primary: '0 80% 62%',
    },
    titleFont: { family: 'Space Grotesk' },
  },

  daylight: {
    label: 'Daylight',
    emoji: '☀️',
    featured: true,
    colors: {
      background: '0 0% 100%',
      text: '0 10% 12%',
      primary: '0 72% 51%',
    },
    titleFont: { family: 'Space Grotesk' },
  },

  midnight: {
    label: 'Midnight',
    emoji: '🌃',
    featured: true,
    colors: {
      background: '222 47% 6%',
      text: '210 40% 96%',
      primary: '190 95% 50%',
    },
    font: { family: 'Inter' },
  },

  forest: {
    label: 'Forest',
    emoji: '🌲',
    featured: true,
    colors: {
      background: '150 30% 8%',
      text: '120 20% 92%',
      primary: '150 60% 45%',
    },
    titleFont: { family: 'Space Grotesk' },
  },

  toxic: {
    label: 'Toxic',
    emoji: '☢️',
    colors: {
      background: '130 30% 7%',
      text: '120 40% 92%',
      primary: '128 70% 45%',
    },
    font: { family: 'JetBrains Mono' },
  },

  sunset: {
    label: 'Sunset',
    emoji: '🌅',
    featured: true,
    colors: {
      background: '20 40% 96%',
      text: '15 30% 12%',
      primary: '15 85% 55%',
    },
  },

  galaxy: {
    label: 'Galaxy',
    emoji: '🌌',
    featured: true,
    colors: {
      background: '260 40% 8%',
      text: '220 30% 95%',
      primary: '270 80% 65%',
    },
    font: { family: 'Inter' },
  },

  ocean: {
    label: 'Ocean',
    emoji: '🌊',
    colors: {
      background: '195 50% 10%',
      text: '185 30% 92%',
      primary: '175 70% 50%',
    },
  },

  paper: {
    label: 'Paper',
    emoji: '📜',
    colors: {
      background: '40 30% 96%',
      text: '30 25% 14%',
      primary: '25 70% 45%',
    },
  },
};

/** Converts a camelCase key to a CSS custom property name, e.g. primaryForeground → --primary-foreground, chart1 → --chart-1. */
export function toThemeVar(key: string): string {
  return `--${key.replace(/([A-Z])/g, '-$1').replace(/([0-9]+)/g, '-$1').toLowerCase()}`;
}

/** Builds a CSS rule body (the var declarations) from a ThemeTokens object. */
export function buildThemeVars(tokens: ThemeTokens): string {
  return (Object.entries(tokens) as [string, string][])
    .map(([k, v]) => `${toThemeVar(k)}: ${v};`)
    .join(' ');
}

/** Builds a CSS `:root { ... }` block string from a ThemeTokens object. */
export function buildThemeCss(tokens: ThemeTokens): string {
  return `:root { ${buildThemeVars(tokens)} }`;
}

/** Derive full ThemeTokens from CoreThemeColors. */
export function coreToTokens(colors: CoreThemeColors): ThemeTokens {
  return deriveTokensFromCore(colors.background, colors.text, colors.primary);
}

/** Build CSS from CoreThemeColors (convenience). */
export function buildThemeCssFromCore(colors: CoreThemeColors): string {
  return buildThemeCss(coreToTokens(colors));
}

/**
 * Resolves a theme preference to the concrete builtin theme name.
 * - "system" → "light" or "dark" based on OS preference.
 * - "custom" → returns "custom" (caller must supply colors from config.customTheme).
 * - "light" / "dark" → returned as-is.
 */
export function resolveTheme(theme: Theme): 'light' | 'dark' | 'custom' {
  if (theme === 'system') {
    return typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  }
  return theme;
}

/**
 * Resolves the effective ThemeConfig for a "light" or "dark" mode.
 * Uses configured themes from AppConfig if available, otherwise falls back
 * to the builtin themes (colors only, no font/background).
 */
export function resolveThemeConfig(mode: 'light' | 'dark', themes?: ThemesConfig): ThemeConfig {
  return themes?.[mode] ?? { colors: builtinThemes[mode] };
}
