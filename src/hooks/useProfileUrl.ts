import type { NostrMetadata } from '@nostrify/nostrify';
import { useNip05Verify } from '@/hooks/useNip05Verify';
import { getProfileUrl } from '@/lib/profileUrl';

/**
 * Returns the internal URL for a user's profile page.
 *
 * Prefers a verified NIP-05 identifier (`/user@domain.com`, or `/domain.com`
 * for `_@domain.com`) and falls back to `/<npub1...>` when the NIP-05 is
 * absent or hasn't been verified to resolve back to this pubkey. The latter
 * prevents an attacker from hijacking profile links by claiming someone
 * else's NIP-05 in their kind-0 metadata.
 *
 * The returned path is understood by the `/:nip19` route (`NIP19Page`), which
 * detects NIP-05 / bare-domain segments and resolves them to a pubkey.
 */
export function useProfileUrl(pubkey: string, metadata?: NostrMetadata): string {
  const nip05 = metadata?.nip05;
  const { data: nip05Verified } = useNip05Verify(nip05, pubkey);
  return getProfileUrl(pubkey, metadata, nip05Verified === true);
}
