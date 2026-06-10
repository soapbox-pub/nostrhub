import { useSeoMeta } from '@unhead/react';
import { Layout } from '@/components/Layout';
import { ExpertCard } from '@/components/ExpertCard';
import { useExperts } from '@/hooks/useExperts';
import { Card, CardContent } from '@/components/ui/card';

const ExpertsPage = () => {
  useSeoMeta({
    title: 'Experts | NostrHub',
    description:
      'The Nostr Experts who anchor NostrHub\u2019s trust model \u2014 their approvals rank NIPs and their follows shape the community.',
  });

  const { experts } = useExperts();

  return (
    <Layout>
      <div className="mx-auto max-w-2xl space-y-3 text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Experts</h1>
        <p className="text-lg text-muted-foreground">
          The people who anchor NostrHub&rsquo;s trust model. Their NIP approvals rank the homepage,
          and their follow lists derive the community that powers discussion.
        </p>
      </div>

      <div className="mt-10">
        {experts.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {experts.map((pubkey) => (
              <ExpertCard key={pubkey} pubkey={pubkey} />
            ))}
          </div>
        ) : (
          <Card className="border-dashed">
            <CardContent className="px-8 py-12 text-center">
              <p className="mx-auto max-w-sm text-muted-foreground">
                No experts configured yet. Add experts in Settings to begin curating NIPs and
                shaping the community.
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      <p className="mx-auto mt-10 max-w-2xl text-center text-sm text-muted-foreground">
        Experts are not gatekeepers &mdash; anyone can publish to Nostr. They are simply a set of
        trusted voices whose curation and follow graph NostrHub uses to surface signal over noise.
        You can review, add, or remove experts at any time from your Settings, tailoring the trust
        model to the people whose judgement you value.
      </p>
    </Layout>
  );
};

export default ExpertsPage;
