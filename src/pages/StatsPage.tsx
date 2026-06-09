import { useSeoMeta } from '@unhead/react';
import { FileText, Heart, Users, Zap, TrendingUp } from 'lucide-react';
import { Layout } from '@/components/Layout';
import { MetricCard } from '@/components/MetricCard';
import { ClientBarChart } from '@/components/ClientBarChart';
import { NetworkUsersChart } from '@/components/NetworkUsersChart';
import { useCount } from '@/hooks/useCount';
import { useClientCounts } from '@/hooks/useClientCounts';
import { ago, DAY, WEEK } from '@/lib/timeRanges';

const DISTINCT = 'distinct:author';

const StatsPage = () => {
  useSeoMeta({
    title: 'Network Stats | NostrHub',
    description: 'Live Nostr network statistics: active users, event volume, and client breakdowns.',
  });

  const now24h = ago(DAY);
  const now7d = ago(WEEK);

  const dau = useCount([{ kinds: [1], since: now24h, search: DISTINCT }]);
  const wau = useCount([{ kinds: [1], since: now7d, search: DISTINCT }]);
  const posts24h = useCount([{ kinds: [1], since: now24h }]);
  const reactions24h = useCount([{ kinds: [7], since: now24h }]);
  const zaps24h = useCount([{ kinds: [9735], since: now24h }]);

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

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <MetricCard title="DAU" value={dau.data} icon={Users} isLoading={dau.isLoading} isError={dau.isError} description="Unique posters (24h)" />
        <MetricCard title="WAU" value={wau.data} icon={Users} isLoading={wau.isLoading} isError={wau.isError} description="Unique posters (7d)" />
        <MetricCard title="Posts (24h)" value={posts24h.data} icon={FileText} isLoading={posts24h.isLoading} isError={posts24h.isError} description="Kind 1" />
        <MetricCard title="Reactions (24h)" value={reactions24h.data} icon={Heart} isLoading={reactions24h.isLoading} isError={reactions24h.isError} description="Kind 7" />
        <MetricCard title="Zaps (24h)" value={zaps24h.data} icon={Zap} isLoading={zaps24h.isLoading} isError={zaps24h.isError} description="Kind 9735" />
      </section>

      <section className="mt-10">
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
