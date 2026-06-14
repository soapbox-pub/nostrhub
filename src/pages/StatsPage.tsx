import { useSeoMeta } from '@unhead/react';
import { Layout } from '@/components/Layout';
import { ClientBarChart } from '@/components/ClientBarChart';
import { NetworkUsersChart } from '@/components/NetworkUsersChart';
import { RelayCountCard } from '@/components/RelayCountCard';
import { useClientCounts } from '@/hooks/useClientCounts';
import { ago, WEEK } from '@/lib/timeRanges';

const DISTINCT = 'distinct:author';

const StatsPage = () => {
  useSeoMeta({
    title: 'Network Stats | NostrHub',
    description: 'Live Nostr network statistics: active users, event volume, and client breakdowns.',
  });

  const now7d = ago(WEEK);

  const clientUsers7d = useClientCounts({ since: now7d, search: DISTINCT });

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Network Stats</h1>
      </div>

      <section className="mb-12">
        <RelayCountCard />
      </section>

      <section>
        <NetworkUsersChart />
      </section>

      <section className="mt-10">
        <ClientBarChart
          title="Users by Client"
          description="Distinct authors per client (last 7 days)"
          data={clientUsers7d.data}
          isLoading={clientUsers7d.isLoading}
        />
      </section>
    </Layout>
  );
};

export default StatsPage;
