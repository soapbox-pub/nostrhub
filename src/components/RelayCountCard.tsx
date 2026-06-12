import { useRelayCount } from '@/hooks/useRelayCount';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Bold headline display of the number of functioning relays on the Nostr
 * network, sourced from the permissionlesstech/georelays discovery dataset.
 */
export function RelayCountCard() {
  const { data, isLoading, isError } = useRelayCount();

  if (isError) return null;

  return (
    <div className="text-center">
      {isLoading || data === undefined ? (
        <Skeleton className="mx-auto h-24 w-64" />
      ) : (
        <p className="text-7xl font-extrabold tracking-tighter tabular-nums sm:text-8xl">
          {data.toLocaleString()}
        </p>
      )}
      <p className="mt-2 text-lg font-medium text-muted-foreground">
        relays on the Nostr network
      </p>
    </div>
  );
}

export default RelayCountCard;
