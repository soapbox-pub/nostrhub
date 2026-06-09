import { useSeoMeta } from '@unhead/react';
import { TrendingUp } from 'lucide-react';
import { Layout } from '@/components/Layout';
import { ClientBarChart } from '@/components/ClientBarChart';
import { NetworkUsersChart } from '@/components/NetworkUsersChart';
import { useClientCounts } from '@/hooks/useClientCounts';
import { ago, WEEK } from '@/lib/timeRanges';

const DISTINCT = 'distinct:author';

const StatsPage = () => {
  useSeoMeta({
    title: 'Network Stats | NostrHub',
    description: 'Live Nostr network statistics: active users, event volume, and client breakdowns.',
  });

  const now7d = ago(WEEK);

  const clientEvents7d = useClientCounts({ since: now7d });
  const clientUsers7d = useClientCounts({ since: now7d, search: DISTINCT });

  return (
    <Layout>
      <div className="mb-6 flex items-center gap-2">
        <TrendingUp className="size-6 text-primary" />
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Network Stats</h1>
          <p className="text-sm text-muted-foreground">
            Live Nostr activity from relay.ditto.pub via NIP-45 COUNT.
          </p>
        </div>
      </div>

      <section>
        <NetworkUsersChart />
      </section>

      <section className="mt-10">
        <h2 className="mb-4 text-lg font-semibold">By Client (last 7 days)</h2>
        <div className="grid gap-6 lg:grid-cols-2">
          <ClientBarChart
            title="Events by Client"
            description="All events per client app"
            data={clientEvents7d.data}
            isLoading={clientEvents7d.isLoading}
          />
          <ClientBarChart
            title="Unique Users by Client"
            description="Distinct authors per client"
            data={clientUsers7d.data}
            isLoading={clientUsers7d.isLoading}
          />
        </div>
      </section>
    </Layout>
  );
};

export default StatsPage;
