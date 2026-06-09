import { useMemo } from 'react';
import { ClientBarChart } from '@/components/ClientBarChart';
import { useClientCounts } from '@/hooks/useClientCounts';
import { HOUR, MONTH } from '@/lib/timeRanges';

/** Distinct-author count via the Ditto relay's NIP-50 search extension. */
const DISTINCT_AUTHOR = 'distinct:author';

function monthAgoSnapped(): number {
  const since = Math.floor(Date.now() / 1000) - MONTH;
  return Math.floor(since / HOUR) * HOUR;
}

interface ClientUsersChartProps {
  title?: string;
  description?: string;
  bare?: boolean;
}

/** Bar chart of distinct authors per NIP-89 client over the last 30 days. */
export function ClientUsersChart({
  title = 'Nostr Clients',
  description = 'Distinct users per client (last 30 days)',
  bare,
}: ClientUsersChartProps) {
  const since = useMemo(() => monthAgoSnapped(), []);
  const clientUsers = useClientCounts({ since, search: DISTINCT_AUTHOR });

  return (
    <ClientBarChart
      title={title}
      description={description}
      data={clientUsers.data}
      isLoading={clientUsers.isLoading}
      bare={bare}
    />
  );
}

export default ClientUsersChart;
