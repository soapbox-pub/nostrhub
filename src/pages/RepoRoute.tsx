import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { nip19 } from 'nostr-tools';
import { Layout } from '@/components/Layout';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';
import { GitRepoPage } from './GitRepoPage';
import NotFound from './NotFound';
import { useNip05Resolve } from '@/hooks/useNip05Resolve';
import { looksLikeNip05 } from '@/lib/nip05';
import { isNostrId } from '@/lib/nostrId';

/**
 * Resolves the `/:owner/:repo` and `/:owner/:relay/:repo` routes to a
 * repository owner pubkey and `d` identifier, then renders {@link GitRepoPage}.
 *
 * The `owner` segment may be:
 * - a NIP-05 identifier (`user@domain.com`) or bare domain (`domain.com` → `_`)
 * - an `npub` / `nprofile` bech32 string
 * - a raw 64-char hex pubkey
 *
 * The optional `relay` segment is a percent-encoded relay hint whose `wss://`
 * scheme may be omitted (NIP-34 clone-URI convention, matching Gitworkshop
 * URLs like `/vitorpamplona.com/relay.ngit.dev/amethyst`). The `repo` segment
 * is the percent-encoded `d` tag value.
 */
export function RepoRoute() {
  const { owner, relay, repo } = useParams<{ owner: string; relay?: string; repo: string }>();

  const identifier = useMemo(() => {
    if (!repo) return undefined;
    try {
      return decodeURIComponent(repo);
    } catch {
      return repo;
    }
  }, [repo]);

  // Optional relay-hint segment: percent-decoded, `wss://` assumed when the
  // scheme is omitted. An unparseable hint is ignored rather than 404ing.
  const relayHint = useMemo(() => {
    if (!relay) return undefined;
    let value: string;
    try {
      value = decodeURIComponent(relay);
    } catch {
      value = relay;
    }
    if (!/^wss?:\/\//i.test(value)) value = `wss://${value}`;
    try {
      const url = new URL(value);
      return url.protocol === 'wss:' || url.protocol === 'ws:' ? url.href : undefined;
    } catch {
      return undefined;
    }
  }, [relay]);

  // NIP-05 / bare-domain owners must be resolved over the network.
  const isNip05 = !!owner && looksLikeNip05(owner);
  const { data: nip05Pubkey, isPending: nip05Loading } = useNip05Resolve(
    isNip05 ? owner : undefined,
  );

  const pubkey = useMemo(() => {
    if (!owner) return undefined;
    if (isNip05) return nip05Pubkey ?? undefined;
    if (isNostrId(owner)) return owner;
    try {
      const decoded = nip19.decode(owner);
      if (decoded.type === 'npub') return decoded.data;
      if (decoded.type === 'nprofile') return decoded.data.pubkey;
    } catch {
      return undefined;
    }
    return undefined;
  }, [owner, isNip05, nip05Pubkey]);

  if (!owner || !identifier) {
    return <NotFound />;
  }

  // A NIP-05 owner that's still resolving — show a skeleton rather than 404.
  if (isNip05 && nip05Loading) {
    return (
      <Layout className="max-w-6xl">
        <div className="space-y-6">
          <Skeleton className="h-9 w-2/3" />
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </Layout>
    );
  }

  if (!pubkey) {
    // NIP-05 resolved to nothing, or the owner segment wasn't a valid identifier.
    if (isNip05) {
      return (
        <Layout className="max-w-6xl">
          <Alert variant="destructive">
            <AlertCircle className="size-4" />
            <AlertDescription>
              Could not resolve the repository owner “{owner}”.
            </AlertDescription>
          </Alert>
        </Layout>
      );
    }
    return <NotFound />;
  }

  return (
    <GitRepoPage
      pubkey={pubkey}
      identifier={identifier}
      relays={relayHint ? [relayHint] : undefined}
    />
  );
}

export default RepoRoute;
