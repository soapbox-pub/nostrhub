/**
 * The card NostrHub's link previews draw for a page with no picture of its
 * own: a NIP, a repository, an issue, an app, a profile. It's the site's own
 * image — the mushroom on the night sky — with what the page is about written
 * beside it: what it is, its title, a line about it, and whose it is. An app
 * or a person is drawn with its icon or avatar in the mushroom's place.
 *
 * It's drawn on an `OffscreenCanvas`, in npanel's sandbox or in a browser
 * alike, in the gateway's fonts. Shadows, filters and transforms are left
 * out: npanel's canvas throws rather than draw them wrong.
 */

const WIDTH = 1200;
const HEIGHT = 630;

/** The night sky of `og-image.webp`, where the mushroom gives way to it. */
const SKY = '#0c071f';
const SKY_DEEP = '#170b2b';
const WHITE = '#f8f6ff';
const MUTED = '#b9b1d0';
const RED = '#f87171';
const PURPLE = '#a855f7';

/** Where the words go: right of the mushroom. */
const TEXT_X = 470;
const TEXT_RIGHT = 1130;
const TEXT_WIDTH = TEXT_RIGHT - TEXT_X;

export interface Card {
  /** What it is, above the title: "Custom NIP". */
  label?: string;
  title: string;
  /** A line or two about it. */
  subtitle?: string;
  /** Whose it is, or where it belongs, at the foot. */
  footer?: string;
  /** An icon or avatar, drawn in place of the mushroom. */
  icon?: string;
  iconShape?: 'circle' | 'square';
}

/** A card, as a JPEG. `origin` is the site's, whose `og-image.webp` it's drawn on. */
export async function drawCard(card: Card, origin: string): Promise<Blob> {
  const canvas = new OffscreenCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d')!;

  const [backdrop, icon] = await Promise.all([
    card.icon ? null : loadImage(`${origin}/og-image.webp`),
    card.icon ? loadImage(card.icon) : null,
  ]);

  const sky = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  sky.addColorStop(0, SKY_DEEP);
  sky.addColorStop(1, SKY);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  if (backdrop) {
    // The mushroom, as it is in the site's own image, and the sky over the
    // wordmark beside it.
    ctx.drawImage(backdrop, 0, 0, WIDTH, HEIGHT);
    const fade = ctx.createLinearGradient(380, 0, 430, 0);
    fade.addColorStop(0, 'rgba(12, 7, 31, 0)');
    fade.addColorStop(1, 'rgba(12, 7, 31, 1)');
    ctx.fillStyle = fade;
    ctx.fillRect(380, 0, WIDTH - 380, HEIGHT);
  } else {
    // A red glow where the mushroom stood, and the icon in it.
    const glow = ctx.createRadialGradient(230, 315, 0, 230, 315, 300);
    glow.addColorStop(0, 'rgba(220, 38, 38, 0.45)');
    glow.addColorStop(1, 'rgba(220, 38, 38, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, TEXT_X, HEIGHT);
    if (icon) drawIcon(ctx, icon, 90, 175, 280, card.iconShape ?? 'square');
  }

  let y = 76;
  // The wordmark, small: Nostr in white, Hub in purple.
  ctx.textBaseline = 'alphabetic';
  ctx.font = 'bold 34px sans-serif';
  ctx.fillStyle = WHITE;
  ctx.fillText('Nostr', TEXT_X, y + 30);
  ctx.fillStyle = PURPLE;
  ctx.fillText('Hub', TEXT_X + ctx.measureText('Nostr').width, y + 30);
  y += 90;

  if (card.label) {
    ctx.font = 'bold 28px sans-serif';
    ctx.fillStyle = RED;
    ctx.fillText(fit(ctx, card.label.toUpperCase(), TEXT_WIDTH), TEXT_X, y);
    y += 24;
  }

  // The title as large as fits in three lines, from 64px down to 40px.
  let size = 64;
  let lines: string[] = [];
  for (; size >= 40; size -= 4) {
    ctx.font = `bold ${size}px sans-serif`;
    const wrapped = wrap(ctx, card.title, TEXT_WIDTH, 3);
    lines = wrapped.lines;
    if (!wrapped.cut) break;
  }
  size = Math.max(size, 40);
  ctx.fillStyle = WHITE;
  const leading = Math.round(size * 1.18);
  for (const line of lines) {
    y += leading;
    ctx.fillText(line, TEXT_X, y);
  }

  const footerY = HEIGHT - 64;
  if (card.subtitle) {
    ctx.font = '30px sans-serif';
    ctx.fillStyle = MUTED;
    // As many lines as fit above the footer, at most three.
    const room = Math.min(3, Math.floor((footerY - 40 - (y + 16)) / 40));
    if (room > 0) {
      y += 16;
      for (const line of wrap(ctx, card.subtitle, TEXT_WIDTH, room).lines) {
        y += 40;
        ctx.fillText(line, TEXT_X, y);
      }
    }
  }

  if (card.footer) {
    ctx.font = 'bold 28px sans-serif';
    ctx.fillStyle = MUTED;
    ctx.fillText(fit(ctx, card.footer, TEXT_WIDTH), TEXT_X, footerY);
  }

  return canvas.convertToBlob({ type: 'image/jpeg', quality: 0.88 });
}

/** An icon, cut to a circle or a rounded square. */
function drawIcon(ctx: OffscreenCanvasRenderingContext2D, image: ImageBitmap, x: number, y: number, size: number, shape: 'circle' | 'square'): void {
  ctx.save();
  ctx.beginPath();
  if (shape === 'circle') ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  else ctx.roundRect(x, y, size, size, size * 0.22);
  ctx.clip();
  const scale = Math.max(size / image.width, size / image.height);
  const sw = size / scale;
  const sh = size / scale;
  ctx.drawImage(image, (image.width - sw) / 2, (image.height - sh) / 2, sw, sh, x, y, size, size);
  ctx.restore();
}

interface Wrapped {
  lines: string[];
  /** Whether it was cut to fit. */
  cut: boolean;
}

/** Text broken into lines that fit, at most `max` of them, the last cut with an ellipsis if it all doesn't fit. */
function wrap(ctx: OffscreenCanvasRenderingContext2D, text: string, width: number, max: number): Wrapped {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (!line || ctx.measureText(next).width <= width) {
      line = next;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  const kept = lines.slice(0, max);
  if (lines.length > max) kept[max - 1] = lines.slice(max - 1).join(' ');
  // A line too long, a word longer than one or what didn't fit, ends in an ellipsis.
  const fitted = kept.map((l) => fit(ctx, l, width));
  return { lines: fitted, cut: fitted.some((l, i) => l !== kept[i]) || lines.length > max };
}

/** Text cut with an ellipsis to fit a width. */
function fit(ctx: OffscreenCanvasRenderingContext2D, text: string, width: number): string {
  if (ctx.measureText(text).width <= width) return text;
  const chars = [...text];
  let lo = 0;
  let hi = chars.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (ctx.measureText(`${chars.slice(0, mid).join('').trimEnd()}…`).width <= width) lo = mid;
    else hi = mid - 1;
  }
  return `${chars.slice(0, lo).join('').trimEnd()}…`;
}

async function loadImage(url: string): Promise<ImageBitmap | null> {
  if (!url.startsWith('https://')) return null;
  try {
    const response = await fetch(url);
    return response.ok ? await createImageBitmap(await response.blob()) : null;
  } catch {
    return null;
  }
}
