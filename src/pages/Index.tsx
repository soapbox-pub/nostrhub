import { useSeoMeta } from '@unhead/react';
import { Layout } from '@/components/Layout';
import { Card, CardContent } from '@/components/ui/card';

const Index = () => {
  useSeoMeta({
    title: 'NostrHub — Build Nostr Together',
    description:
      'NostrHub is where the developer community collaborates on building the Nostr protocol — discover, draft, and discuss NIPs together.',
  });

  return (
    <Layout sidebar={<div className="text-sm text-muted-foreground">Network stats coming soon.</div>}>
      <section className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">NIPs</h1>
        <p className="text-lg text-muted-foreground">
          Nostr Implementation Possibilities, curated by the community.
        </p>
      </section>

      <Card className="mt-6 border-dashed">
        <CardContent className="px-8 py-12 text-center">
          <p className="mx-auto max-w-sm text-muted-foreground">
            NIP browsing is being built. Soon you'll see expert-approved NIPs ranked here, with the
            latest community drafts below.
          </p>
        </CardContent>
      </Card>
    </Layout>
  );
};

export default Index;
