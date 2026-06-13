import type { NostrEvent } from '@nostrify/nostrify';
import type { CoreThemeColors, ThemeFont, ThemeBackground } from '@/themes';
import { hexToHslString, isValidHex } from '@/lib/colorUtils';
import { sanitizeUrl } from '@/lib/sanitizeUrl';

/** Replaceable event: the user's currently active profile theme (Ditto). One per user. */
export const ACTIVE_THEME_KIND = 16767;

// ─── Color Tags ───────────────────────────────────────────────────────

/** Parse `c` tags (["c", "#1a1a2e", "background"]) into core colors, or null. */
function parseColorTags(tags: string[][]): CoreThemeColors | null {
  const colorMap = new Map<string, string>();
  for (const tag of tags) {
    if (tag[0] === 'c' && tag[1] && tag[2]) colorMap.set(tag[2], tag[1]);
  }

  const bgHex = colorMap.get('background');
  const textHex = colorMap.get('text');
  const primaryHex = colorMap.get('primary');

  if (!bgHex || !textHex || !primaryHex) return null;
  if (!isValidHex(bgHex) || !isValidHex(textHex) || !isValidHex(primaryHex)) return null;

  return {
    background: hexToHslString(bgHex),
    text: hexToHslString(textHex),
    primary: hexToHslString(primaryHex),
  };
}

/** Fallback: read colors as JSON from content (legacy Ditto format). */
function parseLegacyContent(content: string): CoreThemeColors | null {
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    if (parsed.background && parsed.text && parsed.primary) {
      return {
        background: String(parsed.background),
        text: String(parsed.text),
        primary: String(parsed.primary),
      };
    }
    if (parsed.background && parsed.foreground && parsed.primary) {
      return {
        background: String(parsed.background),
        text: String(parsed.foreground),
        primary: String(parsed.primary),
      };
    }
  } catch {
    // invalid JSON
  }
  return null;
}

// ─── Font Tags ────────────────────────────────────────────────────────

/** Parse `f` tags into body and title fonts. Tags without a role are body. */
function parseFontTags(tags: string[][]): { font?: ThemeFont; titleFont?: ThemeFont } {
  let font: ThemeFont | undefined;
  let titleFont: ThemeFont | undefined;

  for (const tag of tags) {
    if (tag[0] !== 'f' || !tag[1]) continue;
    const role = tag[3];
    const parsed: ThemeFont = { family: tag[1] };
    const fontUrl = sanitizeUrl(tag[2]);
    if (fontUrl) parsed.url = fontUrl;

    if (role === 'title') {
      if (!titleFont) titleFont = parsed;
    } else if (!font) {
      font = parsed;
    }
  }

  return { font, titleFont };
}

// ─── Background Tag ───────────────────────────────────────────────────

/** Parse a `bg` tag (["bg", "url https://…", "mode cover", …]) into a background. */
function parseBackgroundTag(tags: string[][]): ThemeBackground | undefined {
  const bgTag = tags.find(([n]) => n === 'bg');
  if (!bgTag) return undefined;

  const kv = new Map<string, string>();
  for (let i = 1; i < bgTag.length; i++) {
    const entry = bgTag[i];
    const spaceIdx = entry.indexOf(' ');
    if (spaceIdx === -1) continue;
    kv.set(entry.slice(0, spaceIdx), entry.slice(spaceIdx + 1));
  }

  const url = sanitizeUrl(kv.get('url'));
  if (!url) return undefined;

  const bg: ThemeBackground = { url };
  const mode = kv.get('mode');
  if (mode === 'cover' || mode === 'tile') bg.mode = mode;
  const mimeType = kv.get('m');
  if (mimeType) bg.mimeType = mimeType;
  const dimensions = kv.get('dim');
  if (dimensions) bg.dimensions = dimensions;
  const blurhash = kv.get('blurhash');
  if (blurhash) bg.blurhash = blurhash;

  return bg;
}

// ─── Active Profile Theme (Kind 16767) ────────────────────────────────

export interface ActiveProfileTheme {
  colors: CoreThemeColors;
  font?: ThemeFont;
  titleFont?: ThemeFont;
  background?: ThemeBackground;
  event: NostrEvent;
}

/** Parse and validate a kind 16767 active profile theme event. Returns null if invalid. */
export function parseActiveProfileTheme(event: NostrEvent): ActiveProfileTheme | null {
  if (event.kind !== ACTIVE_THEME_KIND) return null;

  let colors = parseColorTags(event.tags);
  if (!colors && event.content) colors = parseLegacyContent(event.content);
  if (!colors) return null;

  const { font, titleFont } = parseFontTags(event.tags);
  const background = parseBackgroundTag(event.tags);

  return { colors, font, titleFont, background, event };
}
