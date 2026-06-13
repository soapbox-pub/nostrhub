import { deriveTokensFromCore } from '@/lib/colorUtils';

/**
 * The 3 core colors that define a theme (bare HSL strings, e.g. "228 20% 10%").
 * All other CSS tokens are derived from these. This matches the schema used by
 * Ditto's kind 16767 active-profile-theme events.
 */
export interface CoreThemeColors {
  background: string;
  text: string;
  primary: string;
}

/** A font reference: family name + optional direct URL to a font file. */
export interface ThemeFont {
  family: string;
  url?: string;
}

/** Background image/video configuration from a theme event. */
export interface ThemeBackground {
  url: string;
  mode?: 'cover' | 'tile';
  dimensions?: string;
  mimeType?: string;
  blurhash?: string;
}

/** A complete theme (core colors + optional fonts/background). */
export interface ThemeConfig {
  title?: string;
  colors: CoreThemeColors;
  font?: ThemeFont;
  titleFont?: ThemeFont;
  background?: ThemeBackground;
}

/**
 * Full set of derived CSS token values. Each is a complete `hsl(...)` string,
 * matching how NostrHub authors its CSS variables in `src/index.css`.
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

/** Converts a camelCase key to a CSS custom property name, e.g. chart1 → --chart-1. */
export function toThemeVar(key: string): string {
  return `--${key.replace(/([A-Z])/g, '-$1').replace(/([0-9]+)/g, '-$1').toLowerCase()}`;
}

/** Build the `--var: value;` declarations from a ThemeTokens object. */
export function buildThemeVars(tokens: ThemeTokens): string {
  return (Object.entries(tokens) as [string, string][])
    .map(([k, v]) => `${toThemeVar(k)}: ${v};`)
    .join(' ');
}

/** Derive full ThemeTokens from CoreThemeColors. */
export function coreToTokens(colors: CoreThemeColors): ThemeTokens {
  return deriveTokensFromCore(colors.background, colors.text, colors.primary);
}
