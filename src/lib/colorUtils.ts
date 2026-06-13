import type { CoreThemeColors, ThemeTokens } from '@/themes';

// ─── Conversion Utilities ────────────────────────────────────────────

/** Parse an HSL string like "228 20% 10%" into { h, s, l }. Accepts an optional `hsl(...)` wrapper. */
export function parseHsl(hsl: string): { h: number; s: number; l: number } {
  const inner = hsl.trim().replace(/^hsl\(/i, '').replace(/\)$/, '');
  const parts = inner.replace(/%/g, '').split(/[\s,]+/).map(Number);
  return { h: parts[0], s: parts[1], l: parts[2] };
}

/** Format { h, s, l } back to "228 20% 10%" (no wrapper). */
export function formatHsl(h: number, s: number, l: number): string {
  return `${Math.round(h * 10) / 10} ${Math.round(s * 10) / 10}% ${Math.round(l * 10) / 10}%`;
}

/** Wrap a bare HSL triple string in `hsl(...)`. Idempotent. */
export function wrapHsl(hsl: string): string {
  const t = hsl.trim();
  return /^hsl\(/i.test(t) ? t : `hsl(${t})`;
}

/** Convert HSL to RGB. h in [0,360], s,l in [0,100]. Returns [r,g,b] each [0,255]. */
export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

/** Convert RGB [0,255] to HSL { h, s, l } (h in degrees, s/l in percent). */
export function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: l * 100 };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h: h * 360, s: s * 100, l: l * 100 };
}

/** Check whether a string looks like a valid hex color (#RGB, #RRGGBB, or without #). */
export function isValidHex(hex: string): boolean {
  return /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(hex);
}

/** Convert hex color (#RRGGBB or #RGB) to RGB. */
export function hexToRgb(hex: string): [number, number, number] {
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  return [
    parseInt(hex.slice(0, 2), 16),
    parseInt(hex.slice(2, 4), 16),
    parseInt(hex.slice(4, 6), 16),
  ];
}

/** Convert RGB to hex (#rrggbb). */
export function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

/** Convert hex to a bare HSL string like "228 20% 10%". */
export function hexToHslString(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  const { h, s, l } = rgbToHsl(r, g, b);
  return formatHsl(h, s, l);
}

/** Convert HSL string like "228 20% 10%" to hex. */
export function hslStringToHex(hsl: string): string {
  const { h, s, l } = parseHsl(hsl);
  const [r, g, b] = hslToRgb(h, s, l);
  return rgbToHex(r, g, b);
}

// ─── Luminance & Contrast ─────────────────────────────────────────────

/** Relative luminance per WCAG 2.1 (0 = black, 1 = white). */
export function getLuminance(r: number, g: number, b: number): number {
  const sRGB = [r, g, b].map(v => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * sRGB[0] + 0.7152 * sRGB[1] + 0.0722 * sRGB[2];
}

/** WCAG contrast ratio between two colors (each as [r,g,b]). */
export function getContrastRatio(
  rgb1: [number, number, number],
  rgb2: [number, number, number],
): number {
  const l1 = getLuminance(...rgb1);
  const l2 = getLuminance(...rgb2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// ─── Dark/Light Detection ─────────────────────────────────────────────

/** Determine if an HSL background string represents a "dark" theme. */
export function isDarkTheme(backgroundHsl: string): boolean {
  const { h, s, l } = parseHsl(backgroundHsl);
  const [r, g, b] = hslToRgb(h, s, l);
  return getLuminance(r, g, b) < 0.2;
}

/** Resolve the live --background CSS variable to `"dark"` or `"light"`. */
export function getBackgroundThemeMode(): 'dark' | 'light' {
  if (typeof document === 'undefined') return 'dark';
  const bg = getComputedStyle(document.documentElement)
    .getPropertyValue('--background')
    .trim();
  if (!bg) return 'dark';
  return isDarkTheme(bg) ? 'dark' : 'light';
}

// ─── Adjust HSL helpers ───────────────────────────────────────────────

/** Lighten a bare HSL string by a given amount (0-100). */
function lighten(hsl: string, amount: number): string {
  const { h, s, l } = parseHsl(hsl);
  return formatHsl(h, s, Math.min(100, l + amount));
}

/** Darken a bare HSL string by a given amount (0-100). */
function darken(hsl: string, amount: number): string {
  const { h, s, l } = parseHsl(hsl);
  return formatHsl(h, s, Math.max(0, l - amount));
}

/** Get a contrast foreground (white or near-black) for a given background. */
function contrastForeground(bgHsl: string): string {
  return isDarkTheme(bgHsl) ? '0 0% 100%' : '222 47% 8%';
}

/** Rotate a hue by a number of degrees, wrapping at 360. */
function rotateHue(hsl: string, deg: number): string {
  const { h, s, l } = parseHsl(hsl);
  return formatHsl((h + deg + 360) % 360, s, l);
}

// ─── Auto-Derive Full Token Set from Core Colors ──────────────────────

/**
 * Derive the full NostrHub theme token set from 3 core colors. Every value is
 * returned **wrapped in `hsl(...)`** to match how NostrHub's CSS variables are
 * authored (`--background: hsl(0 0% 100%)`).
 *
 * In addition to the 19 standard shadcn tokens, NostrHub uses a `nebula` accent
 * (derived from the primary hue, rotated toward purple) plus a `sidebar-*` token
 * group and five `chart-*` colors.
 *
 * @param background - Background HSL string
 * @param text       - Text/foreground HSL string
 * @param primary    - Primary accent HSL string
 */
export function deriveTokensFromCore(
  background: string,
  text: string,
  primary: string,
): ThemeTokens {
  const dark = isDarkTheme(background);
  const wrap = wrapHsl;

  // Surface colors derived from background.
  const card = dark ? lighten(background, 4) : background;
  const popover = dark ? lighten(background, 2) : background;
  const secondarySurface = dark ? lighten(background, 11) : darken(background, 4);
  const muted = dark ? lighten(background, 9) : darken(background, 4);

  const primaryParsed = parseHsl(primary);
  const border = dark
    ? formatHsl(primaryParsed.h, primaryParsed.s * 0.4, 18)
    : formatHsl(primaryParsed.h, primaryParsed.s * 0.5, 88);
  const input = dark ? lighten(background, 11) : border;

  // Muted foreground: a dimmer version of the main text color.
  const fg = parseHsl(text);
  const mutedFg = dark
    ? formatHsl(fg.h, Math.max(fg.s - 10, 0), Math.max(fg.l - 27, 45))
    : formatHsl(fg.h, Math.max(fg.s - 4, 0), Math.min(fg.l + 32, 55));

  // Primary/accent foregrounds: auto-contrast.
  const primaryFg = contrastForeground(primary);

  // Accent: a soft tint of the nebula/primary hue rotated toward purple.
  const nebula = rotateHue(primary, 30);
  const nebulaParsed = parseHsl(nebula);
  const accent = dark
    ? formatHsl(nebulaParsed.h, Math.max(nebulaParsed.s - 30, 10), 18)
    : formatHsl(nebulaParsed.h, Math.min(nebulaParsed.s, 40), 95);
  const accentFg = dark ? '0 0% 100%' : formatHsl(nebulaParsed.h, 50, 24);

  // Sidebar: a hair off the base background, with the primary as its accent.
  const sidebar = dark ? lighten(background, 2) : darken(background, 2);
  const sidebarAccent = accent;

  // Destructive: standard red.
  const destructive = dark ? '0 80% 62%' : '0 84.2% 60.2%';
  const destructiveFg = '0 0% 100%';

  // Charts: primary, nebula, then evenly-spaced hue rotations.
  const chart1 = primary;
  const chart2 = nebula;
  const chart3 = rotateHue(primary, dark ? 60 : 38);
  const chart4 = rotateHue(primary, 160);
  const chart5 = rotateHue(primary, 220);

  return {
    background: wrap(background),
    foreground: wrap(text),
    card: wrap(card),
    cardForeground: wrap(text),
    popover: wrap(popover),
    popoverForeground: wrap(text),
    primary: wrap(primary),
    primaryForeground: wrap(primaryFg),
    secondary: wrap(secondarySurface),
    secondaryForeground: wrap(text),
    muted: wrap(muted),
    mutedForeground: wrap(mutedFg),
    accent: wrap(accent),
    accentForeground: wrap(accentFg),
    nebula: wrap(nebula),
    destructive: wrap(destructive),
    destructiveForeground: wrap(destructiveFg),
    border: wrap(border),
    input: wrap(input),
    ring: wrap(primary),
    chart1: wrap(chart1),
    chart2: wrap(chart2),
    chart3: wrap(chart3),
    chart4: wrap(chart4),
    chart5: wrap(chart5),
    sidebar: wrap(sidebar),
    sidebarForeground: wrap(mutedFg),
    sidebarPrimary: wrap(primary),
    sidebarPrimaryForeground: wrap(primaryFg),
    sidebarAccent: wrap(sidebarAccent),
    sidebarAccentForeground: wrap(accentFg),
    sidebarBorder: wrap(border),
    sidebarRing: wrap(primary),
  };
}

/** Extract CoreThemeColors from a full ThemeTokens object (legacy/back-compat). */
export function tokensToCoreColors(tokens: ThemeTokens): CoreThemeColors {
  return {
    background: tokens.background,
    text: tokens.foreground,
    primary: tokens.primary,
  };
}
