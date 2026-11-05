/**
 * Normalize, deduplicate and filter a list of relay URLs: `ws:`/`wss:` only,
 * trailing slashes stripped, first occurrence kept. This is also the shape
 * napp hosts store relays in, so a list built here survives their
 * normalization unchanged.
 */
export function normalizeRelayUrls(urls: Iterable<string>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const url of urls) {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      continue;
    }
    if (parsed.protocol !== 'wss:' && parsed.protocol !== 'ws:') continue;
    const normalized = parsed.toString().replace(/\/+$/, '');
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}
