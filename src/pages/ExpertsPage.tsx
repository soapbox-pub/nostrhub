import { useSeoMeta } from '@unhead/react';
import { Link } from 'react-router-dom';
import { Settings, RotateCcw } from 'lucide-react';
import { Layout } from '@/components/Layout';
import { ExpertCard } from '@/components/ExpertCard';
import { useExperts } from '@/hooks/useExperts';
import { DEFAULT_EXPERTS } from '@/lib/experts';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

const isDefaultExperts = (experts: string[]): boolean =>
  experts.length === DEFAULT_EXPERTS.length &&
  experts.every((pk, i) => pk === DEFAULT_EXPERTS[i]);

const ExpertsPage = () => {
  useSeoMeta({
    title: 'Experts | NostrHub',
    description:
      'The Nostr Experts who anchor NostrHub\u2019s trust model \u2014 their approvals rank NIPs and their follows shape the community. Fully configurable by you.',
  });

  const { experts, removeExpert, setExperts } = useExperts();
  const hasChanges = !isDefaultExperts(experts);

  return (
    <Layout>
      <div className="mx-auto max-w-2xl space-y-4 text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Experts</h1>
        <p className="text-lg text-muted-foreground">
          The people who anchor NostrHub&rsquo;s trust model &mdash; their NIP approvals rank the
          homepage, and their follow lists derive the community. This list is{' '}
          <span className="font-medium text-foreground">entirely yours to configure</span>: add or
          remove anyone whose judgement you trust.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button asChild className="gap-1.5">
            <Link to="/settings">
              <Settings className="size-4" /> Configure Experts
            </Link>
          </Button>
          {hasChanges && (
            <Button
              variant="outline"
              className="gap-1.5"
              onClick={() => setExperts(DEFAULT_EXPERTS)}
            >
              <RotateCcw className="size-4" /> Restore defaults
            </Button>
          )}
        </div>
      </div>

      <div className="mt-10">
        {experts.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {experts.map((pubkey) => (
              <ExpertCard
                key={pubkey}
                pubkey={pubkey}
                onRemove={() => removeExpert(pubkey)}
              />
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
    </Layout>
  );
};

export default ExpertsPage;
