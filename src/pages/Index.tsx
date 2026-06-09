import { useSeoMeta } from '@unhead/react';
import { Link } from 'react-router-dom';
import { GraduationCap, Sparkles } from 'lucide-react';
import { Layout } from '@/components/Layout';
import { NipCard } from '@/components/NipCard';
import { CustomNipCard } from '@/components/CustomNipCard';
import { StatsSidebar } from '@/components/StatsSidebar';
import { useRankedNips } from '@/hooks/useRankedNips';
import { useCommunityAuthors } from '@/hooks/useCommunityAuthors';
import { useCustomNips } from '@/hooks/useCustomNips';
import { useExperts } from '@/hooks/useExperts';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';

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
  const { ranked, isLoading: rankedLoading } = useRankedNips();
  const community = useCommunityAuthors();
  const draftsQuery = useCustomNips({
    authors: community.data?.authors,
    limit: 30,
    enabled: !community.isLoading,
  });

  const hasExperts = experts.length > 0;

  return (
    <Layout sidebar={<StatsSidebar />}>
      <section className="mb-8 space-y-1">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">NIPs</h1>
        <p className="text-lg text-muted-foreground">
          Nostr Implementation Possibilities, curated by the community.
        </p>
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
        <SectionHeading
          icon={<GraduationCap className="size-5" />}
          title="Expert-Approved"
          subtitle="Ranked by how many of your experts have approved each NIP."
        />
        <div className="space-y-3">
          {rankedLoading ? (
            <>
              <CardSkeleton />
              <CardSkeleton />
              <CardSkeleton />
            </>
          ) : ranked.length > 0 ? (
            ranked.map((nip, i) => <NipCard key={nip.key} nip={nip} rank={i + 1} />)
          ) : (
            <Card className="border-dashed">
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
        <div className="space-y-3">
          {community.isLoading || draftsQuery.isLoading ? (
            <>
              <CardSkeleton />
              <CardSkeleton />
            </>
          ) : draftsQuery.data && draftsQuery.data.length > 0 ? (
            draftsQuery.data.map((nip) => <CustomNipCard key={nip.address} nip={nip} />)
          ) : (
            <Card className="border-dashed">
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
