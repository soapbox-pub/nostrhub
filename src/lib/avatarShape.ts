import type { CSSProperties } from 'react';

/**
 * An avatar shape is stored in kind-0 metadata as the `shape` property.
 * Typically an emoji glyph used as a mask (e.g. "🐱", "⭐").
 *
 * When absent or invalid, avatars render as circles (the default).
 */
export type AvatarShape = string;

/**
 * Checks whether a string could be an emoji shape value.
 *
 * Rather than matching specific Unicode emoji patterns (fragile, and excludes
 * valid emoji like keycap sequences, flags, and complex ZWJ families), we
 * simply check that the value is a short, non-ASCII string.
 */
export function isEmoji(value: string): boolean {
  if (!value || value.length === 0) return false;
  // Emoji are short (even complex ZWJ sequences are under ~20 JS chars)
  // and contain non-ASCII characters.
  if (value.length > 20) return false;
  // eslint-disable-next-line no-control-regex
  return /[^\x00-\x7F]/.test(value);
}

/** Type guard for valid avatar shape values (currently emoji glyphs). */
export function isValidAvatarShape(value: unknown): value is AvatarShape {
  if (typeof value !== 'string' || value.length === 0) return false;
  return isEmoji(value);
}

/**
 * Extract the avatar shape from Nostr metadata. Returns `undefined`
 * when the metadata is missing or the `shape` field is invalid.
 */
export function getAvatarShape(
  metadata: { [key: string]: unknown } | undefined,
): AvatarShape | undefined {
  const raw = metadata?.shape;
  return isValidAvatarShape(raw) ? raw : undefined;
}

/**
 * CSS filter that creates a crisp outline around a shaped (emoji) avatar,
 * mimicking `border-4 border-background` without clipping the mask. Apply
 * this to a **wrapper** around the masked `<Avatar>`.
 */
export const shapedAvatarBorderStyle: CSSProperties = {
  filter:
    'drop-shadow(3px 0 0 hsl(var(--background)))' +
    ' drop-shadow(-3px 0 0 hsl(var(--background)))' +
    ' drop-shadow(0 3px 0 hsl(var(--background)))' +
    ' drop-shadow(0 -3px 0 hsl(var(--background)))',
};

// ── Emoji mask generation ───────────────────────────────────────────────────

/** In-memory cache: emoji string → mask data-URL. */
const emojiMaskCache = new Map<string, string>();

/**
 * Get a CSS `mask-image` data-URL for an avatar shape. Returns an empty
 * string when the shape is invalid or mask generation fails (in which case
 * the avatar should fall back to a circle).
 */
export function getAvatarMaskUrl(shape: string): string {
  if (isEmoji(shape)) return getEmojiMaskUrl(shape);
  return '';
}

/**
 * Renders an emoji onto a canvas and produces a PNG data-URL alpha mask
 * suitable for use as a CSS `mask-image`. The glyph is measured, the crop
 * is squared (so non-square emoji aren't stretched), and the result is
 * cached. If `mask-image` is unsupported the avatar renders as a plain
 * square (the mask is simply ignored by the browser).
 */
export function getEmojiMaskUrl(emoji: string): string {
  const cached = emojiMaskCache.get(emoji);
  if (cached !== undefined) return cached;

  // Guard for non-DOM environments (SSR / tests).
  if (typeof document === 'undefined') return '';

  // ── Pass 1: draw emoji on an oversized scratch canvas ──────────────────
  const fontSize = 512;
  const scratch = fontSize * 1.5; // 768 – generous room
  const c1 = document.createElement('canvas');
  c1.width = scratch;
  c1.height = scratch;
  const ctx1 = c1.getContext('2d');
  if (!ctx1) return '';

  ctx1.textAlign = 'center';
  ctx1.textBaseline = 'middle';
  ctx1.font = `${fontSize}px serif`;
  ctx1.fillText(emoji, scratch / 2, scratch / 2);

  // ── Pass 2: find the tight bounding box ────────────────────────────────
  // Use an alpha threshold to ignore semi-transparent shadows/glows and
  // anti-aliasing fringes that would otherwise inflate the bounding box.
  const ALPHA_THRESHOLD = 25; // ~10% opacity
  const { data: px, width: sw, height: sh } = ctx1.getImageData(0, 0, scratch, scratch);
  let t = sh;
  let b = 0;
  let l = sw;
  let r = 0;
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      if (px[(y * sw + x) * 4 + 3] > ALPHA_THRESHOLD) {
        if (y < t) t = y;
        if (y > b) b = y;
        if (x < l) l = x;
        if (x > r) r = x;
      }
    }
  }
  if (r < l || b < t) return ''; // nothing drawn

  // ── Pass 3: square the bounding box ────────────────────────────────────
  let cropW = r - l + 1;
  let cropH = b - t + 1;
  if (cropW > cropH) {
    const diff = cropW - cropH;
    t -= Math.floor(diff / 2);
    cropH = cropW;
  } else if (cropH > cropW) {
    const diff = cropH - cropW;
    l -= Math.floor(diff / 2);
    cropW = cropH;
  }
  if (t < 0) t = 0;
  if (l < 0) l = 0;

  // ── Pass 4: redraw cropped region onto the output canvas ───────────────
  const out = 256;
  const c2 = document.createElement('canvas');
  c2.width = out;
  c2.height = out;
  const ctx2 = c2.getContext('2d');
  if (!ctx2) return '';

  ctx2.drawImage(c1, l, t, cropW, cropH, 0, 0, out, out);

  // ── Pass 5: convert to alpha mask (white + original alpha) ─────────────
  const img = ctx2.getImageData(0, 0, out, out);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = 255; // R
    d[i + 1] = 255; // G
    d[i + 2] = 255; // B
    // d[i + 3] (alpha) kept as-is
  }
  ctx2.putImageData(img, 0, 0);

  const url = c2.toDataURL('image/png');
  emojiMaskCache.set(emoji, url);
  return url;
}
