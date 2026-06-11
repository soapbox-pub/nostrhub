import { nip19 } from 'nostr-tools';
import { useParams } from 'react-router-dom';
import NotFound from './NotFound';
import { CustomNipPage } from './CustomNipPage';
import { GitRepoPage } from './GitRepoPage';
import { ProfilePage } from './ProfilePage';
import { CUSTOM_NIP_KIND } from '@/lib/nips';
import { GIT_REPO_KIND, GIT_STATE_KIND } from '@/lib/git';

export function NIP19Page() {
  const { nip19: identifier } = useParams<{ nip19: string }>();

  if (!identifier) {
    return <NotFound />;
  }

  let decoded;
  try {
    decoded = nip19.decode(identifier);
  } catch {
    return <NotFound />;
  }

  const { type } = decoded;

  switch (type) {
    case 'npub':
      return <ProfilePage pubkey={decoded.data} />;

    case 'nprofile':
      return <ProfilePage pubkey={decoded.data.pubkey} />;

    case 'note':
      return <div>Note placeholder</div>;

    case 'nevent':
      return <div>Event placeholder</div>;

    case 'naddr': {
      // Community NIPs (kind 30817) get a dedicated detail page.
      if (decoded.data.kind === CUSTOM_NIP_KIND) {
        return <CustomNipPage naddr={identifier} />;
      }
      // NIP-34 git repositories: announcement (30617) or state (30618)
      // addresses both resolve to the repository page.
      if (decoded.data.kind === GIT_REPO_KIND || decoded.data.kind === GIT_STATE_KIND) {
        const { pubkey, identifier: d, relays } = decoded.data;
        return <GitRepoPage pubkey={pubkey} identifier={d} relays={relays} />;
      }
      return <div>Addressable event placeholder</div>;
    }

    default:
      return <NotFound />;
  }
}
