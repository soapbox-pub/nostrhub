import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { NipCard, NipCardSkeleton } from '@/components/NipCard';
import { AppCard, AppCardSkeleton } from '@/components/AppCard';
import { DiscoveryGrid, DiscoveryPage } from '@/components/DiscoveryGrid';
import { useOfficialNips } from '@/hooks/useOfficialNips';
import { useCustomNips } from '@/hooks/useCustomNips';
import { useCommunityAuthors } from '@/hooks/useCommunityAuthors';
import { useAppsForKind } from '@/hooks/useAppsForNip';
import { officialToRanked, customToRanked, type RankedNip } from '@/hooks/useRankedNips';
import NotFound from '@/pages/NotFound';

/** Does an official-index kind cell (e.g. "20" or "5000-5999") cover `kind`? */
function kindMatches(cell: string, kind: number): boolean {
  const range = cell.match(/^(\d+)-(\d+)$/);
  if (range) return kind >= Number(range[1]) && kind <= Number(range[2]);
  return cell === String(kind);
}

/** NIP-01 storage class for a kind number. */
function storageClass(kind: number): string {
  if (kind >= 30000 && kind < 40000) {
    return 'an addressable event, so relays keep only the latest per author and d-tag';
  }
  if (kind >= 20000 && kind < 30000) {
    return 'an ephemeral event, so relays relay it but are not expected to store it';
  }
  if (kind >= 10000 && kind < 20000) {
    return 'a replaceable event, so relays keep only the latest per author';
  }
  if (kind >= 1000 && kind < 10000) {
    return 'a regular event, stored permanently by relays';
  }
  return 'a legacy-range event, with storage behavior defined per kind';
}

/**
 * Reference page for a single event kind (`/k/:kind`): what it is, which NIPs
 * define or mention it, and which apps announce support for it.
 */
export function KindPage() {
  const { kind: kindParam } = useParams<{ kind: string }>();
  const valid = Boolean(kindParam && /^\d+$/.test(kindParam));
  const kindNum = valid ? Number(kindParam) : 0;

  const officialQuery = useOfficialNips();
  const community = useCommunityAuthors();
  const customQuery = useCustomNips({
    kind: valid ? kindParam : undefined,
    authors: community.data?.authors,
    limit: 100,
    enabled: valid && !community.isLoading,
  });
  const appsQuery = useAppsForKind(valid ? kindParam : undefined);

  // Official NIPs whose Event Kinds entries cover this kind (incl. ranges).
  const officialNips = useMemo(
    () =>
      (officialQuery.data ?? []).filter((nip) =>
        nip.eventKinds?.some((ek) => kindMatches(ek.kind, kindNum)),
      ),
    [officialQuery.data, kindNum],
  );

  const nips = useMemo<RankedNip[]>(
    () => [
      ...officialNips.map(officialToRanked),
      ...(customQuery.data ?? []).map(customToRanked),
    ],
    [officialNips, customQuery.data],
  );

  // Index description for the exact kind (e.g. "Picture" for kind 20).
  const kindDescription = useMemo(() => {
    for (const nip of officialQuery.data ?? []) {
      const ek = nip.eventKinds?.find((ek) => ek.kind === kindParam);
      if (ek?.description) return ek.description;
    }
    return undefined;
  }, [officialQuery.data, kindParam]);

  useSeoMeta({
    title: valid ? `Kind ${kindParam} | NostrHub` : 'Not Found | NostrHub',
    description: valid
      ? `Event kind ${kindParam} on Nostr: the NIPs that define it and the apps that handle it.`
      : undefined,
  });

  if (!valid) return <NotFound />;

  const nipsLoading =
    officialQuery.isLoading || community.isLoading || customQuery.isLoading;

  return (
    <DiscoveryPage
      title={`Kind ${kindParam}`}
      description={
        <>
          {kindDescription && <strong className="font-medium text-foreground">{kindDescription}. </strong>}
          Kind {kindParam} is {storageClass(kindNum)}.
        </>
      }
    >
      <section className="space-y-4" aria-label={`NIPs referencing kind ${kindParam}`}>
        <h2 className="font-display text-2xl font-bold tracking-tight">NIPs</h2>
        <DiscoveryGrid
          items={nips}
          isLoading={nipsLoading}
          skeletonCount={3}
          getKey={(nip) => nip.key}
          renderItem={(nip) => <NipCard nip={nip} />}
          renderSkeleton={() => <NipCardSkeleton />}
          empty={`No NIPs reference kind ${kindParam} yet.`}
        />
      </section>

      <section className="space-y-4" aria-label={`Apps handling kind ${kindParam}`}>
        <h2 className="font-display text-2xl font-bold tracking-tight">Apps</h2>
        <DiscoveryGrid
          items={appsQuery.data}
          isLoading={appsQuery.isLoading}
          skeletonCount={3}
          getKey={(app) => app.address}
          renderItem={(app) => <AppCard app={app} />}
          renderSkeleton={() => <AppCardSkeleton />}
          empty={`No apps announce support for kind ${kindParam} yet.`}
        />
      </section>
    </DiscoveryPage>
  );
}

export default KindPage;
