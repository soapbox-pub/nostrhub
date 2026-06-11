import { useMemo } from 'react';
import { addDays, format, isAfter, startOfDay } from 'date-fns';
import {
  useContributionActivity,
  activityWindowStart,
  type ContributionCategory,
  type DayActivity,
} from '@/hooks/useContributionActivity';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/** Cell color by intensity level (0 = none, 4 = highest). */
const LEVEL_CLASSES = [
  'bg-muted/70',
  'bg-primary/30',
  'bg-primary/55',
  'bg-primary/80',
  'bg-primary',
] as const;

function intensity(count: number, max: number): number {
  if (count <= 0) return 0;
  if (max <= 0) return 1;
  return Math.min(4, Math.max(1, Math.ceil((count / max) * 4)));
}

/** Singular/plural tooltip names per contribution category. */
const CATEGORY_NAMES: Record<ContributionCategory, [string, string]> = {
  code: ['patch/PR', 'patches/PRs'],
  issue: ['issue', 'issues'],
  nip: ['NIP', 'NIPs'],
  repo: ['repo update', 'repo updates'],
};

/** Tooltip suffix like ": 2 patches/PRs, 1 NIP". */
function breakdown(activity: DayActivity | undefined): string {
  if (!activity || activity.total === 0) return '';
  const parts = (Object.keys(CATEGORY_NAMES) as ContributionCategory[])
    .map((category) => {
      const count = activity.categories[category];
      if (!count) return null;
      return `${count} ${CATEGORY_NAMES[category][count === 1 ? 0 : 1]}`;
    })
    .filter((part): part is string => part !== null);
  return parts.length > 0 ? `: ${parts.join(', ')}` : '';
}

interface Week {
  /** One date per day, Sunday-first; future days are null. */
  days: (Date | null)[];
}

/** Build the 53-week grid from the window start through today. */
function buildWeeks(): Week[] {
  const today = startOfDay(new Date());
  const weeks: Week[] = [];
  let cursor = activityWindowStart(today);

  while (!isAfter(cursor, today)) {
    const days: (Date | null)[] = [];
    for (let i = 0; i < 7; i++) {
      days.push(isAfter(cursor, today) ? null : cursor);
      cursor = addDays(cursor, 1);
    }
    weeks.push({ days });
  }
  return weeks;
}

/** GitHub-style contribution heatmap of a user's Nostr activity over the last year. */
export function ContributionHeatmap({ pubkey }: { pubkey: string }) {
  const { data, isLoading } = useContributionActivity(pubkey);

  const weeks = useMemo(() => buildWeeks(), []);

  const max = useMemo(
    () => Math.max(0, ...Object.values(data?.days ?? {}).map((d) => d.total)),
    [data?.days],
  );

  // Label a column when its first day starts a new month.
  const monthLabels = useMemo(() => {
    const labels: string[] = [];
    let prev = '';
    for (const week of weeks) {
      const first = week.days[0];
      const month = first ? format(first, 'MMM') : '';
      labels.push(month && month !== prev ? month : '');
      if (month) prev = month;
    }
    return labels;
  }, [weeks]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">
          {isLoading ? (
            <Skeleton className="h-5 w-56" />
          ) : (
            <>
              {data?.total ?? 0} contribution{data?.total === 1 ? '' : 's'} in the last year
            </>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto pb-4">
        <div className="inline-flex flex-col gap-1.5">
          <div className="flex gap-2">
            {/* Day-of-week labels */}
            <div
              className="grid shrink-0 grid-rows-7 gap-[3px] text-[10px] leading-none text-muted-foreground"
              aria-hidden="true"
            >
              {['', 'Mon', '', 'Wed', '', 'Fri', ''].map((label, i) => (
                <span key={i} className="flex h-[10px] items-center">
                  {label}
                </span>
              ))}
            </div>

            <div className="flex flex-col gap-1">
              {/* Month labels */}
              <div className="flex gap-[3px] text-[10px] leading-none text-muted-foreground" aria-hidden="true">
                {monthLabels.map((label, i) => (
                  <span key={i} className="w-[10px] shrink-0 overflow-visible whitespace-nowrap">
                    {label}
                  </span>
                ))}
              </div>

              {/* Cells */}
              <div
                className="flex gap-[3px]"
                role="img"
                aria-label="Contribution activity over the last year"
              >
                {weeks.map((week, wi) => (
                  <div key={wi} className="grid grid-rows-7 gap-[3px]">
                    {week.days.map((day, di) => {
                      if (!day) {
                        return <span key={di} className="size-[10px]" aria-hidden="true" />;
                      }
                      const key = format(day, 'yyyy-MM-dd');
                      const activity = data?.days[key];
                      const count = activity?.total ?? 0;
                      const label = `${count} contribution${count === 1 ? '' : 's'} on ${format(day, 'MMM d, yyyy')}${breakdown(activity)}`;
                      return (
                        <span
                          key={di}
                          title={label}
                          aria-label={label}
                          className={cn(
                            'size-[10px] rounded-[2px] ring-1 ring-inset ring-foreground/5',
                            isLoading ? 'animate-pulse bg-muted/50' : LEVEL_CLASSES[intensity(count, max)],
                          )}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Legend */}
          <div className="flex items-center justify-end gap-1.5 text-[10px] leading-none text-muted-foreground">
            <span>Less</span>
            {LEVEL_CLASSES.map((cls) => (
              <span
                key={cls}
                className={cn('size-[10px] rounded-[2px] ring-1 ring-inset ring-foreground/5', cls)}
                aria-hidden="true"
              />
            ))}
            <span>More</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default ContributionHeatmap;
