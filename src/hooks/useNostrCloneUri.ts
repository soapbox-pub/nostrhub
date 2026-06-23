import { useAuthor } from '@/hooks/useAuthor';
import { useNip05Verify } from '@/hooks/useNip05Verify';
import { nostrCloneUri } from '@/lib/git';

/**
 * Returns the repository's `nostr://<npub|nip05>/<identifier>` clone URI,
 * preferring a verified NIP-05 handle for the owner segment and falling back
 * to the npub. Mirrors {@link useRepoUrl}'s anti-impersonation behaviour.
 *
 * @param pubkey      Repository owner (hex pubkey).
 * @param identifier  Repository `d` tag value.
 */
export function useNostrCloneUri(pubkey: string, identifier: string): string {
  const author = useAuthor(pubkey);
  const nip05 = author.data?.metadata?.nip05;
  const { data: nip05Verified } = useNip05Verify(nip05, pubkey);
  return nostrCloneUri(pubkey, identifier, nip05, nip05Verified === true);
}
