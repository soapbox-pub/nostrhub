import { Navigate, useParams } from 'react-router-dom';
import { nip19 } from 'nostr-tools';
import NotFound from './NotFound';
import { EventRoute } from './EventRoute';
import { GitTicketPage } from './GitTicketPage';
import { GIT_ISSUE_KIND, GIT_PR_KIND } from '@/lib/git';

/**
 * Gitworkshop-compatible ticket permalinks:
 *
 *   /:owner/:repo/prs/:nip19
 *   /:owner/:repo/issues/:nip19
 *   /:owner/:relay/:repo/prs/:nip19
 *   /:owner/:relay/:repo/issues/:nip19
 *
 * The owner / relay / repo segments are contextual only — the ticket resolves
 * its own repository from its `a` tag — so the trailing nevent/note is decoded
 * and routed exactly like a root-level NIP-19 identifier.
 */
export function GitTicketRoute() {
  const { nip19: identifier } = useParams<{ nip19: string }>();

  if (!identifier) return <NotFound />;

  let decoded;
  try {
    decoded = nip19.decode(identifier);
  } catch {
    return <NotFound />;
  }

  if (decoded.type === 'nevent') {
    // Hinted issues/MRs skip the fetch round-trip, mirroring NIP19Page.
    if (decoded.data.kind === GIT_ISSUE_KIND || decoded.data.kind === GIT_PR_KIND) {
      return <GitTicketPage eventId={decoded.data.id} />;
    }
    return <EventRoute id={decoded.data.id} relays={decoded.data.relays} />;
  }

  if (decoded.type === 'note') {
    return <EventRoute id={decoded.data} />;
  }

  return <NotFound />;
}

/**
 * Gitworkshop-compatible list paths — `/:owner(/:relay)/:repo/issues` and
 * `/…/prs` — redirect to the repository page with the matching tab selected.
 */
export function RepoTabRedirect({ tab }: { tab: 'issues' | 'pulls' }) {
  const { owner, relay, repo } = useParams<{ owner: string; relay?: string; repo: string }>();

  if (!owner || !repo) return <NotFound />;

  const segments = [owner, relay, repo]
    .filter((s): s is string => Boolean(s))
    .map((s) => encodeURIComponent(s));

  return <Navigate to={`/${segments.join('/')}?tab=${tab}`} replace />;
}
