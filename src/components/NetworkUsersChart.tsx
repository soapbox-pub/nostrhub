import { Info } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { useNetworkUsers } from '@/hooks/useNetworkUsers';

const chartConfig: ChartConfig = {
  count: {
    label: 'Users',
    color: 'var(--primary)',
  },
};

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toLocaleString();
}

function formatAxis(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1000) return `${(v / 1000).toFixed(0)}K`;
  return v.toString();
}

/**
 * Network-wide usage: a Monthly Active Users headline plus a 30-day area chart
 * of distinct users active across the whole Nostr network. One point per day,
 * each counting distinct kind-1 authors in that 24h window (NIP-45 COUNT with
 * `distinct:author`).
 */
export function NetworkUsersChart() {
  const { data, isLoading, isError } = useNetworkUsers(30);

  if (isError) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          {isLoading || !data ? (
            <Skeleton className="h-8 w-48" />
          ) : (
            <h2 className="text-2xl font-bold tracking-tight">
              {formatNumber(data.mau)}{' '}
              <span className="font-medium text-muted-foreground">Active Users</span>
            </h2>
          )}
          <Popover>
            <PopoverTrigger
              className="-mr-1 -mt-1 shrink-0 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="About this metric"
            >
              <Info className="size-4" />
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 text-sm text-muted-foreground">
              Distinct users who posted across the whole Nostr network in the past 30 days.
            </PopoverContent>
          </Popover>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading || !data ? (
          <Skeleton className="h-[240px] w-full" />
        ) : (
          <ChartContainer config={chartConfig} className="h-[240px] w-full">
            <AreaChart data={data.series} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="fill-network-users" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                interval="preserveStartEnd"
                className="text-xs"
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickMargin={4}
                width={45}
                className="text-xs"
                tickFormatter={formatAxis}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Area
                type="monotone"
                dataKey="count"
                stroke="var(--primary)"
                strokeWidth={2}
                fill="url(#fill-network-users)"
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2 }}
              />
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}

export default NetworkUsersChart;
