import { useSeoMeta } from '@unhead/react';
import { Link } from 'react-router-dom';
import { Sparkles, Plus } from 'lucide-react';
import { Layout } from '@/components/Layout';
import { NipCard } from '@/components/NipCard';
import { StatsSidebar } from '@/components/StatsSidebar';
import { useRankedNips, type RankedNip } from '@/hooks/useRankedNips';
import { useCommunityAuthors } from '@/hooks/useCommunityAuthors';
import { useCustomNips } from '@/hooks/useCustomNips';
import { useExperts } from '@/hooks/useExperts';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { nipTargetKey } from '@/hooks/useNipApprovals';
import type { CustomNip } from '@/lib/nips';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { AvatarGroup, AvatarGroupCount } from '@/components/ui/avatar';
import { UserAvatar } from '@/components/UserAvatar';

/** Adapt a community draft into the shape `NipCard` renders. */
function draftToRanked(nip: CustomNip): RankedNip {
  const target = { type: 'custom', address: nip.address } as const;
  return {
    key: nipTargetKey(target),
    target,
    title: nip.title,
    custom: nip,
    kinds: nip.kinds,
    expertCount: 0,
    totalCount: 0,
    expertApprovers: [],
  };
}

function SectionHeading({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle?: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-primary">{icon}</span>
      <div>
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>
    </div>
  );
}

function CardSkeleton() {
  return (
    <Card>
      <CardContent className="space-y-2 p-4">
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-4 w-1/3" />
      </CardContent>
    </Card>
  );
}

const Index = () => {
  useSeoMeta({
    title: 'NostrHub — Build Nostr Together',
    description:
      'NostrHub is where the developer community collaborates on building the Nostr protocol — discover, draft, and discuss NIPs together.',
  });

  const { experts } = useExperts();
  const { user } = useCurrentUser();
  const { ranked, isLoading: rankedLoading } = useRankedNips();
  const community = useCommunityAuthors();
  const draftsQuery = useCustomNips({
    authors: community.data?.authors,
    limit: 30,
    enabled: !community.isLoading,
  });

  const hasExperts = experts.length > 0;

  // Avatar stack: show up to 5 expert avatars, then a "+N" overflow count.
  const shownExperts = experts.slice(0, 5);
  const extraExperts = experts.length - shownExperts.length;

  return (
    <Layout sidebar={<StatsSidebar />}>
      <section className="mb-10 flex flex-col items-center gap-4 text-center">
        <h1 className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-3xl font-bold tracking-tight text-transparent sm:text-5xl">
          Nostr Powered by You
        </h1>
        {hasExperts && (
          <AvatarGroup>
            {shownExperts.map((pubkey) => (
              <UserAvatar key={pubkey} pubkey={pubkey} size="lg" />
            ))}
            {extraExperts > 0 && (
              <AvatarGroupCount className="text-sm">+{extraExperts}</AvatarGroupCount>
            )}
          </AvatarGroup>
        )}
      </section>

      <section className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">NIPs</h1>
          <p className="text-lg text-muted-foreground">
            Nostr Implementation Possibilities, curated by the community.
          </p>
        </div>
        {user && (
          <Button asChild size="sm" className="shrink-0 gap-1.5 rounded-full self-start sm:self-auto">
            <Link to="/create">
              <Plus className="size-4" />
              New NIP
            </Link>
          </Button>
        )}
      </section>

      {!hasExperts && (
        <Card className="mb-8 border-primary/40 bg-primary/5">
          <CardContent className="flex flex-col items-start gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm">
              No experts configured. Add Nostr Experts to curate the NIP ranking and community.
            </p>
            <Button asChild size="sm">
              <Link to="/settings">Configure experts</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Ranked NIPs */}
      <section className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rankedLoading ? (
            <>
              <CardSkeleton />
              <CardSkeleton />
              <CardSkeleton />
            </>
          ) : ranked.length > 0 ? (
            ranked.map((nip) => <NipCard key={nip.key} nip={nip} />)
          ) : (
            <Card className="border-dashed sm:col-span-2 lg:col-span-3">
              <CardContent className="px-8 py-12 text-center">
                <p className="mx-auto max-w-sm text-muted-foreground">
                  No expert-approved NIPs yet. When your experts approve NIPs, they'll appear here
                  ranked by approval count.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </section>

      {/* Latest community drafts */}
      <section className="mt-12 space-y-4">
        <SectionHeading
          icon={<Sparkles className="size-5" />}
          title="Latest Drafts"
          subtitle="Fresh NIPs from the developer community."
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {community.isLoading || draftsQuery.isLoading ? (
            <>
              <CardSkeleton />
              <CardSkeleton />
            </>
          ) : draftsQuery.data && draftsQuery.data.length > 0 ? (
            draftsQuery.data.map((nip) => (
              <NipCard key={nip.address} nip={draftToRanked(nip)} />
            ))
          ) : (
            <Card className="border-dashed sm:col-span-2 lg:col-span-3">
              <CardContent className="px-8 py-12 text-center">
                <p className="mx-auto max-w-sm text-muted-foreground">
                  No community drafts yet.{' '}
                  <Link to="/create" className="font-medium text-primary hover:underline">
                    Draft the first one
                  </Link>
                  .
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </section>
    </Layout>
  );
};

export default Index;
