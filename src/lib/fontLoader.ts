import type { ThemeFont } from '@/themes';
import { getBundledFont } from '@/lib/fonts';
import { sanitizeUrl } from '@/lib/sanitizeUrl';

/** Default body font stack (mirrors `--font-sans` in src/index.css). */
const DEFAULT_BODY_STACK = `'Inter Variable', 'Inter', system-ui, sans-serif`;
/** Default title/display font stack (mirrors `--font-display` in src/index.css). */
const DEFAULT_TITLE_STACK = `'Space Grotesk Variable', 'Space Grotesk', 'Inter Variable', system-ui, sans-serif`;

const FACE_STYLE_ID = 'theme-font-faces';
const BODY_OVERRIDE_ID = 'theme-font-overrides';
const TITLE_OVERRIDE_ID = 'theme-title-font-overrides';

/** Track injected @font-face families so we only register each once. */
const registeredFaces = new Set<string>();

function ensureStyle(id: string): HTMLStyleElement {
  let el = document.getElementById(id) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement('style');
    el.id = id;
    document.head.appendChild(el);
  }
  return el;
}

/**
 * Inject a remote @font-face rule for a non-bundled font, if a safe https URL
 * is provided. No-ops on invalid/non-https URLs (CSP + XSS hygiene).
 */
function injectRemoteFace(family: string, url: string | undefined) {
  const safe = sanitizeUrl(url);
  if (!safe) return;
  const key = `${family}::${safe}`;
  if (registeredFaces.has(key)) return;
  registeredFaces.add(key);

  const faceEl = ensureStyle(FACE_STYLE_ID);
  // family and safe are both validated (family used only inside quotes; safe is an https href)
  faceEl.textContent += `@font-face { font-family: "${family.replace(/"/g, '')}"; src: url("${safe}"); font-display: swap; }\n`;
}

/**
 * Load and apply a body font. Bundled fonts are imported lazily; non-bundled
 * fonts get a remote @font-face from their URL. Passing `undefined` clears the
 * override (reverts to the default Inter stack).
 */
export function loadAndApplyFont(font: ThemeFont | undefined): void {
  const override = ensureStyle(BODY_OVERRIDE_ID);

  if (!font?.family) {
    override.textContent = '';
    return;
  }

  const bundled = getBundledFont(font.family);
  if (bundled) {
    bundled.load().catch(() => {/* font load failure is non-fatal */});
    // Variable @fontsource packages register as e.g. "Inter Variable".
    override.textContent = `html, body { font-family: "${font.family} Variable", "${font.family}", ${DEFAULT_BODY_STACK} !important; }`;
  } else {
    injectRemoteFace(font.family, font.url);
    override.textContent = `html, body { font-family: "${font.family.replace(/"/g, '')}", ${DEFAULT_BODY_STACK} !important; }`;
  }
}

/**
 * Load and apply a title/display font (applies to `.font-display` and headings).
 * Passing `undefined` clears the override (reverts to the default Space Grotesk stack).
 */
export function loadAndApplyTitleFont(font: ThemeFont | undefined): void {
  const override = ensureStyle(TITLE_OVERRIDE_ID);

  if (!font?.family) {
    override.textContent = '';
    return;
  }

  const bundled = getBundledFont(font.family);
  let stack: string;
  if (bundled) {
    bundled.load().catch(() => {/* non-fatal */});
    stack = `"${font.family} Variable", "${font.family}", ${DEFAULT_TITLE_STACK}`;
  } else {
    injectRemoteFace(font.family, font.url);
    stack = `"${font.family.replace(/"/g, '')}", ${DEFAULT_TITLE_STACK}`;
  }
  override.textContent = `.font-display, h1, h2, h3 { font-family: ${stack} !important; }`;
}
