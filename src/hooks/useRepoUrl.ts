import { useAuthor } from '@/hooks/useAuthor';
import { useNip05Verify } from '@/hooks/useNip05Verify';
import { getRepoUrl } from '@/lib/git';

/**
 * Returns the internal `/{owner}/{repo}` URL for a NIP-34 repository.
 *
 * Resolves the owner's kind-0 metadata to prefer a verified NIP-05 handle in
 * the owner segment (`/user@domain.com/repo`), falling back to the npub when
 * the NIP-05 is absent or unverified. Mirrors {@link useProfileUrl}'s
 * anti-impersonation behaviour.
 *
 * @param pubkey      Repository owner (hex pubkey).
 * @param identifier  Repository `d` tag value.
 */
export function useRepoUrl(pubkey: string, identifier: string): string {
  const author = useAuthor(pubkey);
  const nip05 = author.data?.metadata?.nip05;
  const { data: nip05Verified } = useNip05Verify(nip05, pubkey);
  return getRepoUrl(pubkey, identifier, nip05, nip05Verified === true);
}
