import type { NostrEvent } from '@nostrify/nostrify';
import { sanitizeUrl } from '@/lib/sanitizeUrl';

/**
 * Strip URLs and nostr entity references from note text and collapse
 * whitespace, leaving a clean human-readable excerpt for pull quotes,
 * tickers, and preview cards.
 */
export function noteExcerpt(content: string, max = 220): string {
  const stripped = content
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/nostr:[0-9a-z]+/gi, '')
    .replace(/\b(?:npub1|nprofile1|note1|nevent1|naddr1)[0-9a-z]{20,}\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (stripped.length <= max) return stripped;
  const cut = stripped.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${lastSpace > 0 ? cut.slice(0, lastSpace) : cut}…`;
}

const IMAGE_URL_RE = /https:\/\/\S+\.(?:png|jpe?g|gif|webp|avif)(?:\?\S*)?/gi;

/**
 * Extract sanitized https image URLs from a note: NIP-92 `imeta` tags first,
 * then bare image links in the content.
 */
export function noteImageUrls(event: NostrEvent, max = 4): string[] {
  const urls: string[] = [];

  for (const tag of event.tags) {
    if (tag[0] !== 'imeta') continue;
    const urlEntry = tag.slice(1).find((entry) => entry.startsWith('url '));
    const safe = sanitizeUrl(urlEntry?.slice(4));
    if (safe) urls.push(safe);
  }

  for (const match of event.content.matchAll(IMAGE_URL_RE)) {
    const safe = sanitizeUrl(match[0]);
    if (safe) urls.push(safe);
  }

  return Array.from(new Set(urls)).slice(0, max);
}

/** Compact relative timestamp: "20m", "3h", "2d", or "now". */
export function shortAgo(timestampSeconds: number): string {
  const seconds = Math.max(0, Math.floor(Date.now() / 1000 - timestampSeconds));
  if (seconds < 60) return 'now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return `${Math.floor(days / 7)}w`;
}
