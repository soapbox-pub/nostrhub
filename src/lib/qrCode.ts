import QRCode from 'qrcode';
import {
  getContrastRatio,
  getLuminance,
  hslToRgb,
  parseHsl,
  rgbToHex,
} from '@/lib/colorUtils';

/** Minimum contrast ratio between QR modules and background for reliable scanning. */
const MIN_QR_CONTRAST = 3;
/** Saturation (%) above which a color is considered "colorful". */
const COLORFUL_SAT_MIN = 15;
/** Lightness range within which a color appears visually colorful. */
const COLORFUL_L_MIN = 20;
const COLORFUL_L_MAX = 80;

type Hsl = { h: number; s: number; l: number };

/**
 * Read a CSS custom property (e.g. `--primary`) from the document root and
 * parse it into HSL. NostrHub authors its variables wrapped as `hsl(h s% l%)`,
 * which `parseHsl` strips automatically. Returns `null` when unavailable.
 */
function readCssHsl(name: string): Hsl | null {
  if (typeof document === 'undefined') return null;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (!raw) return null;
  try {
    const { h, s, l } = parseHsl(raw);
    if ([h, s, l].some((n) => Number.isNaN(n))) return null;
    return { h, s, l };
  } catch {
    return null;
  }
}

function isColorful({ s, l }: Hsl): boolean {
  return s > COLORFUL_SAT_MIN && l > COLORFUL_L_MIN && l < COLORFUL_L_MAX;
}

function toRgb({ h, s, l }: Hsl): [number, number, number] {
  return hslToRgb(h, s, l);
}

/**
 * Pick the QR module color: prefer `--primary`, but fall back to `--foreground`
 * when it is more colorful and offers better contrast against the background.
 */
function pickModuleColor(primary: Hsl, foreground: Hsl | null, bg: [number, number, number]): Hsl {
  if (foreground && isColorful(foreground)) {
    const fgContrast = getContrastRatio(toRgb(foreground), bg);
    const primaryContrast = getContrastRatio(toRgb(primary), bg);
    if (fgContrast > primaryContrast) return foreground;
  }
  return primary;
}

/** Darken the module color until it meets the minimum contrast against a light bg. */
function darkenToContrast(module: Hsl, bg: [number, number, number]): string {
  const { h, s } = module;
  let l = module.l;
  let rgb = hslToRgb(h, s, l);
  for (let i = 0; i < 100 && getContrastRatio(rgb, bg) < MIN_QR_CONTRAST && l > 0; i++) {
    l = Math.max(0, l - 2);
    rgb = hslToRgb(h, s, l);
  }
  return rgbToHex(...rgb);
}

/** Lighten the module color until it meets the minimum contrast against a dark bg. */
function lightenToContrast(module: Hsl, bg: [number, number, number]): string {
  const { h, s } = module;
  let l = module.l;
  let rgb = hslToRgb(h, s, l);
  for (let i = 0; i < 100 && getContrastRatio(rgb, bg) < MIN_QR_CONTRAST && l < 100; i++) {
    l = Math.min(100, l + 2);
    rgb = hslToRgb(h, s, l);
  }
  return rgbToHex(...rgb);
}

/**
 * Derive QR module + background hex colors from the active theme.
 *
 * Light themes: white background, themed module color (darkened for contrast).
 * Dark themes: `--background` as the QR background, themed module color
 * (lightened for contrast). Falls back to black-on-white.
 */
export function getThemedQRColors(): { dark: string; light: string } {
  const primary = readCssHsl('--primary');
  const foreground = readCssHsl('--foreground');
  const background = readCssHsl('--background');

  if (!primary) return { dark: '#000000', light: '#ffffff' };

  const bgIsDark = background ? getLuminance(...toRgb(background)) < 0.2 : false;

  if (!bgIsDark) {
    const white: [number, number, number] = [255, 255, 255];
    const module = pickModuleColor(primary, foreground, white);
    return { dark: darkenToContrast(module, white), light: '#ffffff' };
  }

  if (!background) return { dark: '#ffffff', light: '#000000' };
  const bgRgb = toRgb(background);
  const module = pickModuleColor(primary, foreground, bgRgb);
  return {
    dark: lightenToContrast(module, bgRgb),
    light: rgbToHex(...bgRgb),
  };
}

/**
 * Generate a QR code as a PNG data URL, themed with the active theme's colors.
 *
 * Uses error correction level `M` and runtime-derived module/background colors
 * (with WCAG contrast enforcement) so the code scans reliably in light or dark.
 */
export async function generateQR(data: string): Promise<string> {
  const { dark, light } = getThemedQRColors();
  return QRCode.toDataURL(data, {
    width: 400,
    margin: 2,
    errorCorrectionLevel: 'M',
    color: { dark, light },
  });
}
