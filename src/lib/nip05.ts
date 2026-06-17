/**
 * NIP-05 identifier string helpers.
 *
 * A NIP-05 identifier has the form `<name>@<domain>`. The special name `_`
 * denotes the "root" user of a domain and is conventionally displayed and
 * routed as the bare domain (e.g. `_@example.com` → `example.com`).
 */

/** Known NIP-19 bech32 prefixes — used to avoid mistaking them for domains. */
const NIP19_PREFIXES = ['npub1', 'nprofile1', 'note1', 'nevent1', 'naddr1'];

/**
 * Format a NIP-05 identifier for display.
 * `_@domain.com` → `domain.com`; everything else is returned unchanged.
 */
export function formatNip05Display(nip05: string): string {
  return nip05.startsWith('_@') ? nip05.slice(2) : nip05;
}

/** Extract the domain part of a NIP-05 identifier (`user@domain.com` → `domain.com`). */
export function getNip05Domain(nip05: string): string {
  const at = nip05.indexOf('@');
  return at === -1 ? nip05 : nip05.slice(at + 1);
}

/** Extract the name part of a NIP-05 identifier (`user@domain.com` → `user`). */
export function getNip05User(nip05: string): string {
  const at = nip05.indexOf('@');
  return at === -1 ? '_' : nip05.slice(0, at);
}

/**
 * Checks whether a string looks like a NIP-05 identifier (`user@domain.com`)
 * or a bare domain (e.g. `fiatjaf.com`, treated as `_@fiatjaf.com`).
 * Strips a leading `@` if present.
 */
export function looksLikeNip05(value: string): boolean {
  const cleaned = value.startsWith('@') ? value.slice(1) : value;
  // user@domain.com — must have text on both sides of @ and a dot in the domain.
  if (cleaned.includes('@')) {
    const atIndex = cleaned.indexOf('@');
    return atIndex > 0 && atIndex < cleaned.length - 1 && cleaned.slice(atIndex + 1).includes('.');
  }
  // bare domain — "something.tld" with non-empty parts and not a NIP-19 prefix.
  const dotIndex = cleaned.indexOf('.');
  return (
    dotIndex > 0 &&
    dotIndex < cleaned.length - 1 &&
    !NIP19_PREFIXES.some((p) => cleaned.startsWith(p))
  );
}
