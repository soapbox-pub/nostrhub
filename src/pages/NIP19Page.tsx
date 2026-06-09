import { nip19 } from 'nostr-tools';
import { useParams } from 'react-router-dom';
import NotFound from './NotFound';
import { CustomNipPage } from './CustomNipPage';
import { CUSTOM_NIP_KIND } from '@/lib/nips';

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
    case 'nprofile':
      // Profile view implemented in a later phase.
      return <div>Profile placeholder</div>;

    case 'note':
      return <div>Note placeholder</div>;

    case 'nevent':
      return <div>Event placeholder</div>;

    case 'naddr':
      // Community NIPs (kind 30817) get a dedicated detail page.
      if (decoded.data.kind === CUSTOM_NIP_KIND) {
        return <CustomNipPage naddr={identifier} />;
      }
      return <div>Addressable event placeholder</div>;

    default:
      return <NotFound />;
  }
}
