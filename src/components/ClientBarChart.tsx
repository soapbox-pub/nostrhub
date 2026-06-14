import { Info } from 'lucide-react';
import { Bar, BarChart, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import type { ClientCount } from '@/hooks/useClientCounts';

interface ClientBarChartProps {
  title: string;
  description?: string;
  data: ClientCount[] | undefined;
  isLoading?: boolean;
  /** Render just the chart without the surrounding Card chrome. */
  bare?: boolean;
}

interface ClientBar {
  name: string;
  value: number;
  fill: string;
}

/** Horizontal bar chart comparing a metric across NIP-89 clients. */
export function ClientBarChart({ title, description, data, isLoading, bare }: ClientBarChartProps) {
  const chartData: ClientBar[] = (data ?? [])
    .filter((d) => d.count > 0)
    .map((d) => ({ name: d.client.label, value: d.count, fill: d.client.color }));

  const chartConfig: ChartConfig = Object.fromEntries(
    (data ?? []).map((d) => [d.client.label, { label: d.client.label, color: d.client.color }]),
  );

  const chartBody =
    isLoading || chartData.length === 0 ? (
      <Skeleton className="h-[320px] w-full" />
    ) : (
      <ChartContainer config={chartConfig} className="h-[320px] w-full">
        <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <XAxis
            type="number"
            tickLine={false}
            axisLine={false}
            className="text-xs"
            tickFormatter={(v: number) => {
              if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
              if (v >= 1000) return `${(v / 1000).toFixed(0)}K`;
              return v.toString();
            }}
          />
          <YAxis
            type="category"
            dataKey="name"
            tickLine={false}
            axisLine={false}
            className="text-xs"
            width={70}
            interval={0}
          />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={28} />
        </BarChart>
      </ChartContainer>
    );

  if (bare) return chartBody;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-2xl font-bold tracking-tight">{title}</CardTitle>
          {description && (
            <Popover>
              <PopoverTrigger
                className="-mr-1 -mt-1 shrink-0 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="About this metric"
              >
                <Info className="size-4" />
              </PopoverTrigger>
              <PopoverContent align="end" className="w-72 text-sm text-muted-foreground">
                {description}
              </PopoverContent>
            </Popover>
          )}
        </div>
      </CardHeader>
      <CardContent>{chartBody}</CardContent>
    </Card>
  );
}

export default ClientBarChart;
