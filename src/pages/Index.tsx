import { useSeoMeta } from '@unhead/react';
import { Link } from 'react-router-dom';
import { Sparkles, Plus } from 'lucide-react';
import { Layout } from '@/components/Layout';
import { NipCard } from '@/components/NipCard';
import { StatsSidebar } from '@/components/StatsSidebar';
import { ChatPreviewCard } from '@/components/ChatPreviewCard';
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
      <span className="text-primary drop-shadow-[0_0_8px_hsl(264_90%_72%/0.6)]">{icon}</span>
      <div>
        <h2 className="font-display text-xl font-semibold tracking-tight">{title}</h2>
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
    <Layout
      sidebar={
        <>
          <StatsSidebar />
          <ChatPreviewCard />
        </>
      }
    >
      <section className="relative mb-12 flex flex-col items-center gap-5 overflow-hidden rounded-3xl border border-primary/15 bg-card/40 px-6 py-14 text-center backdrop-blur-sm sm:py-20">
        {/* Nebula halo behind the headline */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 left-1/2 size-[28rem] -translate-x-1/2 rounded-full bg-primary/25 blur-[120px]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-32 right-0 size-72 rounded-full bg-nebula/20 blur-[110px]"
        />

        <h1 className="relative font-display text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl">
          <span className="text-cosmic">Nostr</span> Powered by You
        </h1>

        <p className="relative max-w-xl text-base text-muted-foreground sm:text-lg">
          Explore the constellation of NIPs, draft new ideas, and steer the protocol forward — all in the open.
        </p>

        {hasExperts && (
          <div className="relative flex flex-col items-center gap-2">
            <AvatarGroup>
              {shownExperts.map((pubkey) => (
                <UserAvatar key={pubkey} pubkey={pubkey} size="lg" />
              ))}
              {extraExperts > 0 && (
                <AvatarGroupCount className="text-sm">+{extraExperts}</AvatarGroupCount>
              )}
            </AvatarGroup>
            <span className="text-xs uppercase tracking-wider text-muted-foreground">
              Curated by Nostr experts
            </span>
          </div>
        )}
      </section>

      <Card className="border-primary/15 bg-card/70 p-6 shadow-xl shadow-primary/5 backdrop-blur-sm sm:p-8">
        <section className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">NIPs</h1>
            <p className="text-lg text-muted-foreground">
              Nostr Implementation Possibilities, curated by the community.
            </p>
          </div>
          {user && (
            <Button asChild size="sm" className="shrink-0 gap-1.5 rounded-full self-start shadow-lg shadow-primary/25 sm:self-auto">
              <Link to="/create">
                <Plus className="size-4" />
                New NIP
              </Link>
            </Button>
          )}
        </section>

        {!hasExperts && (
          <Card className="border-primary/40 bg-primary/5">
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
      </Card>
    </Layout>
  );
};

export default Index;
