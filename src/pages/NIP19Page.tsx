import { nip19 } from 'nostr-tools';
import { Navigate, useParams } from 'react-router-dom';
import NotFound from './NotFound';
import { ArticlePage } from './ArticlePage';
import { AppPage } from './AppPage';
import { CustomNipPage } from './CustomNipPage';
import { GitRepoPage } from './GitRepoPage';
import { NotePage } from './NotePage';
import { ProfilePage } from './ProfilePage';
import { Nip05ProfileRoute } from './Nip05ProfileRoute';
import { ZapstoreAppPage } from './ZapstoreAppPage';
import { ZapstoreReleasePage } from './ZapstoreReleasePage';
import { ARTICLE_KIND } from '@/hooks/useExpertPress';
import { CUSTOM_NIP_KIND } from '@/lib/nips';
import { APP_HANDLER_KIND } from '@/lib/apps';
import { GIT_REPO_KIND, GIT_STATE_KIND } from '@/lib/git';
import { GRAPH_NODE_KIND } from '@/lib/planGraph';
import { ZAPSTORE_APP_KIND, ZAPSTORE_RELEASE_KIND } from '@/lib/zapstore';
import { looksLikeNip05 } from '@/lib/nip05';

export function NIP19Page() {
  const { nip19: identifier } = useParams<{ nip19: string }>();

  if (!identifier) {
    return <NotFound />;
  }

  // NIP-05 identifiers (`user@domain.com`) and bare domains (`domain.com`,
  // treated as `_@domain.com`) resolve to a profile over the network.
  if (looksLikeNip05(identifier)) {
    return <Nip05ProfileRoute identifier={identifier} />;
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
      return <NotePage id={decoded.data} />;

    case 'nevent':
      // A pinned custom-NIP revision (kind 30817) renders the NIP detail page
      // bound to that exact event id, so a specific version can be viewed.
      if (decoded.data.kind === CUSTOM_NIP_KIND) {
        return <CustomNipPage eventId={decoded.data.id} />;
      }
      return <NotePage id={decoded.data.id} />;

    case 'naddr': {
      // Community NIPs (kind 30817) get a dedicated detail page.
      if (decoded.data.kind === CUSTOM_NIP_KIND) {
        return <CustomNipPage naddr={identifier} />;
      }
      // NIP-23 long-form articles.
      if (decoded.data.kind === ARTICLE_KIND) {
        return <ArticlePage pubkey={decoded.data.pubkey} identifier={decoded.data.identifier} />;
      }
      // NIP-34 git repositories: announcement (30617) or state (30618)
      // addresses both resolve to the repository page.
      if (decoded.data.kind === GIT_REPO_KIND || decoded.data.kind === GIT_STATE_KIND) {
        const { pubkey, identifier: d, relays } = decoded.data;
        return <GitRepoPage pubkey={pubkey} identifier={d} relays={relays} />;
      }
      // NIP-89 app handler events get the app detail page.
      if (decoded.data.kind === APP_HANDLER_KIND) {
        return <AppPage pubkey={decoded.data.pubkey} identifier={decoded.data.identifier} />;
      }
      // Zapstore app listings (kind 32267) render in-app, with a link out to
      // the Zapstore web page as an escape hatch.
      if (decoded.data.kind === ZAPSTORE_APP_KIND) {
        return <ZapstoreAppPage pubkey={decoded.data.pubkey} identifier={decoded.data.identifier} />;
      }
      // Zapstore software releases (kind 30063) get their own detail page.
      if (decoded.data.kind === ZAPSTORE_RELEASE_KIND) {
        return <ZapstoreReleasePage pubkey={decoded.data.pubkey} identifier={decoded.data.identifier} />;
      }
      // Plan-graph nodes open on the graph with the node selected.
      if (decoded.data.kind === GRAPH_NODE_KIND) {
        const { kind, pubkey, identifier: d } = decoded.data;
        return <Navigate to={`/plan?node=${encodeURIComponent(`${kind}:${pubkey}:${d}`)}`} replace />;
      }
      return <div>Addressable event placeholder</div>;
    }

    default:
      return <NotFound />;
  }
}
