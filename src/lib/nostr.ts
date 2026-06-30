import { nip19 } from 'nostr-tools';

/**
 * Resolve a user identifier to a hex pubkey. Accepts a 64-char hex pubkey, an
 * `npub`, or an `nprofile`. Returns null if the input isn't a valid identifier.
 */
export function resolvePubkey(input: string): string | null {
  const value = input.trim();
  if (!value) return null;
  if (/^[0-9a-f]{64}$/i.test(value)) return value.toLowerCase();
  try {
    const decoded = nip19.decode(value);
    if (decoded.type === 'npub') return decoded.data;
    if (decoded.type === 'nprofile') return decoded.data.pubkey;
  } catch {
    return null;
  }
  return null;
}

/** Deterministic short display string for a hex pubkey, based on its npub. */
export function shortNpub(pubkey: string): string {
  try {
    const npub = nip19.npubEncode(pubkey);
    return `${npub.slice(0, 10)}…${npub.slice(-4)}`;
  } catch {
    return `${pubkey.slice(0, 8)}…`;
  }
}

/**
 * Human-friendly relay label for display.
 *
 * - `wss://` is the default scheme and is dropped (`wss://relay.example/` →
 *   `relay.example`); any other scheme (e.g. `ws://`) is kept so the distinction
 *   stays visible.
 * - An empty path (just `/`) is trimmed; a real path is preserved
 *   (`wss://host/relay` → `host/relay`).
 */
export function formatRelayName(url: string): string {
  const raw = url.trim();

  try {
    const parsed = new URL(raw);
    const scheme = parsed.protocol === 'wss:' ? '' : `${parsed.protocol}//`;
    // host already includes a non-default port; drop an empty ("/") path.
    const path = parsed.pathname === '/' ? '' : parsed.pathname;
    return `${scheme}${parsed.host}${path}${parsed.search}`;
  } catch {
    // Best-effort string fallback for anything URL can't parse.
    let s = raw.replace(/^wss:\/\//i, '');
    if (s.endsWith('/') && !s.slice(0, -1).includes('/')) s = s.slice(0, -1);
    return s;
  }
}


