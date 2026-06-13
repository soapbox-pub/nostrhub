/**
 * Bundled fonts available for theming. Each has a lazy `load()` that imports its
 * `@fontsource-variable` package (so the CSS `@font-face` is registered) and a
 * `cdnUrl` used when publishing a theme to Nostr so other clients can load it.
 *
 * NostrHub ships three variable fonts. Any other `font.family` referenced by a
 * theme (e.g. from a remote profile theme) falls back to a remote `@font-face`
 * injected from the font's `url`, or to the default stack if no URL is given.
 */
export interface BundledFont {
  /** CSS font-family name. */
  family: string;
  /** Lazily import the bundled @fontsource package. */
  load: () => Promise<unknown>;
  /** A CDN URL for the font, embedded in published theme events. */
  cdnUrl: string;
  /** Coarse category for grouping in pickers. */
  category: 'sans' | 'serif' | 'mono' | 'display';
}

export const bundledFonts: Record<string, BundledFont> = {
  Inter: {
    family: 'Inter',
    load: () => import('@fontsource-variable/inter'),
    cdnUrl: 'https://cdn.jsdelivr.net/fontsource/fonts/inter:vf@latest/latin-wght-normal.woff2',
    category: 'sans',
  },
  'Space Grotesk': {
    family: 'Space Grotesk',
    load: () => import('@fontsource-variable/space-grotesk'),
    cdnUrl: 'https://cdn.jsdelivr.net/fontsource/fonts/space-grotesk:vf@latest/latin-wght-normal.woff2',
    category: 'display',
  },
  'JetBrains Mono': {
    family: 'JetBrains Mono',
    load: () => import('@fontsource-variable/jetbrains-mono'),
    cdnUrl: 'https://cdn.jsdelivr.net/fontsource/fonts/jetbrains-mono:vf@latest/latin-wght-normal.woff2',
    category: 'mono',
  },
};

/** Look up a bundled font by family name (case-sensitive match on `family`). */
export function getBundledFont(family: string | undefined): BundledFont | undefined {
  if (!family) return undefined;
  return bundledFonts[family];
}
