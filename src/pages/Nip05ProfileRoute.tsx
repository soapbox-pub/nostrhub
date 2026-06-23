import { Layout } from '@/components/Layout';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';
import { ProfilePage } from './ProfilePage';
import { useNip05Resolve } from '@/hooks/useNip05Resolve';

/**
 * Resolves a NIP-05 identifier (`user@domain.com`) or bare domain
 * (`domain.com` → `_@domain.com`) to a pubkey via /.well-known/nostr.json,
 * then renders the {@link ProfilePage}.
 *
 * Used by the `/:nip19` route when the path segment looks like a NIP-05
 * address rather than a bech32 / hex identifier.
 */
export function Nip05ProfileRoute({ identifier }: { identifier: string }) {
  const { data: pubkey, isPending } = useNip05Resolve(identifier);

  if (isPending) {
    return (
      <Layout className="max-w-5xl">
        <div className="space-y-6">
          <Skeleton className="-mx-4 h-40 sm:mx-0 sm:h-52 sm:rounded-2xl" />
          <div className="flex items-center gap-4 px-2">
            <Skeleton className="size-24 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-7 w-48" />
              <Skeleton className="h-4 w-32" />
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  if (!pubkey) {
    return (
      <Layout className="max-w-5xl">
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertDescription>
            Could not resolve the NIP-05 identifier “{identifier}”. The domain may
            be unreachable or no longer lists this name.
          </AlertDescription>
        </Alert>
      </Layout>
    );
  }

  return <ProfilePage pubkey={pubkey} />;
}

export default Nip05ProfileRoute;
