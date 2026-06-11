import { useMemo, useState } from 'react';
import { addDays, addMonths, format, parseISO, startOfDay, startOfMonth, startOfWeek, subDays } from 'date-fns';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import {
  useContributionActivity,
  type ContributionCategory,
} from '@/hooks/useContributionActivity';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

type WindowKey = '30d' | '90d' | '1y';

interface WindowSpec {
  label: string;
  days: number;
  bucket: 'day' | 'week' | 'month';
}

const WINDOWS: Record<WindowKey, WindowSpec> = {
  '30d': { label: '30 days', days: 30, bucket: 'day' },
  '90d': { label: '90 days', days: 90, bucket: 'week' },
  '1y': { label: '1 year', days: 365, bucket: 'month' },
};

const chartConfig: ChartConfig = {
  code: { label: 'Patches & PRs', color: 'var(--chart-1)' },
  issue: { label: 'Issues', color: 'var(--chart-2)' },
  nip: { label: 'NIPs', color: 'var(--chart-3)' },
  repo: { label: 'Repo updates', color: 'var(--chart-4)' },
};

const CATEGORIES = Object.keys(chartConfig) as ContributionCategory[];

interface BucketDatum {
  label: string;
  code: number;
  issue: number;
  nip: number;
  repo: number;
}

/** Map a date to the key of the bucket containing it. */
function bucketKey(date: Date, bucket: WindowSpec['bucket']): string {
  switch (bucket) {
    case 'day':
      return format(date, 'yyyy-MM-dd');
    case 'week':
      return format(startOfWeek(date, { weekStartsOn: 0 }), 'yyyy-MM-dd');
    case 'month':
      return format(startOfMonth(date), 'yyyy-MM');
  }
}

/** Ordered, zero-filled buckets covering the trailing window through today. */
function buildBuckets(spec: WindowSpec): { key: string; label: string }[] {
  const today = startOfDay(new Date());
  const start = subDays(today, spec.days - 1);
  const buckets: { key: string; label: string }[] = [];
  const seen = new Set<string>();

  let cursor =
    spec.bucket === 'month'
      ? startOfMonth(start)
      : spec.bucket === 'week'
        ? startOfWeek(start, { weekStartsOn: 0 })
        : start;

  while (cursor <= today) {
    const key = bucketKey(cursor, spec.bucket);
    if (!seen.has(key)) {
      seen.add(key);
      buckets.push({
        key,
        label: spec.bucket === 'month' ? format(cursor, 'MMM') : format(cursor, 'MMM d'),
      });
    }
    cursor = spec.bucket === 'month' ? addMonths(cursor, 1) : addDays(cursor, spec.bucket === 'week' ? 7 : 1);
  }
  return buckets;
}

/**
 * Time-series bar chart of a user's contributions (patches/PRs, issues, NIPs,
 * repo updates), stacked by category, over a selectable trailing window.
 */
export function ContributionChart({ pubkey }: { pubkey: string }) {
  const [window, setWindow] = useState<WindowKey>('90d');
  const spec = WINDOWS[window];
  const { data, isLoading } = useContributionActivity(pubkey, spec.days);

  const series: BucketDatum[] = useMemo(() => {
    const buckets = buildBuckets(spec);
    const byKey = new Map<string, BucketDatum>();
    for (const { key, label } of buckets) {
      byKey.set(key, { label, code: 0, issue: 0, nip: 0, repo: 0 });
    }

    for (const [dayKey, activity] of Object.entries(data?.days ?? {})) {
      const datum = byKey.get(bucketKey(parseISO(dayKey), spec.bucket));
      if (!datum) continue;
      for (const category of CATEGORIES) {
        datum[category] += activity.categories[category] ?? 0;
      }
    }

    return [...byKey.values()];
  }, [data?.days, spec]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {isLoading ? (
            <Skeleton className="h-6 w-48" />
          ) : (
            <h2 className="text-base font-semibold">
              {data?.total ?? 0} contribution{data?.total === 1 ? '' : 's'} in the last{' '}
              {spec.label}
            </h2>
          )}
          <ToggleGroup
            type="single"
            size="sm"
            variant="outline"
            value={window}
            onValueChange={(value) => {
              if (value) setWindow(value as WindowKey);
            }}
            aria-label="Activity window"
          >
            {(Object.keys(WINDOWS) as WindowKey[]).map((key) => (
              <ToggleGroupItem key={key} value={key} className="px-3 text-xs">
                {key}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[200px] w-full" />
        ) : (
          <ChartContainer config={chartConfig} className="h-[200px] w-full">
            <BarChart data={series} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
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
                width={30}
                allowDecimals={false}
                className="text-xs"
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <ChartLegend content={<ChartLegendContent />} />
              {CATEGORIES.map((category, i) => (
                <Bar
                  key={category}
                  dataKey={category}
                  stackId="contributions"
                  fill={`var(--color-${category})`}
                  radius={i === CATEGORIES.length - 1 ? [2, 2, 0, 0] : 0}
                />
              ))}
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}

export default ContributionChart;
