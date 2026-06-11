import { HelpCircle } from 'lucide-react';
import { TIERS, type CompatTier } from '@/lib/appReviews';
import { TIER_ICONS } from '@/lib/tierIcons';
import { cn } from '@/lib/utils';

interface TierBadgeProps {
  tier: CompatTier | null;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  className?: string;
}

/** Pill badge showing an app's compatibility tier (ProtonDB-style). */
export function TierBadge({ tier, size = 'md', showLabel = true, className }: TierBadgeProps) {
  const iconClass = size === 'sm' ? 'size-3' : size === 'md' ? 'size-3.5' : 'size-4';
  const sizeClass = cn(
    size === 'sm' && 'px-2 py-0.5 text-[10px]',
    size === 'md' && 'px-3 py-1 text-xs',
    size === 'lg' && 'px-4 py-1.5 text-sm',
  );

  if (!tier) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full bg-muted font-semibold uppercase tracking-wider text-muted-foreground',
          sizeClass,
          className,
        )}
      >
        <HelpCircle className={iconClass} aria-hidden="true" />
        {showLabel && 'No Data'}
      </span>
    );
  }

  const info = TIERS[tier];
  const Icon = TIER_ICONS[tier];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border bg-background/50 font-bold uppercase tracking-wider',
        sizeClass,
        className,
      )}
      style={{ borderColor: info.color, color: info.color }}
    >
      <Icon className={iconClass} aria-hidden="true" />
      {showLabel && info.label}
    </span>
  );
}

/** Small filled dot variant for dense table cells. */
export function TierDot({ tier, className }: { tier: CompatTier | null; className?: string }) {
  if (!tier) {
    return (
      <span className={cn('inline-block size-3 rounded-full bg-muted', className)} title="No data" />
    );
  }
  const info = TIERS[tier];
  return (
    <span
      className={cn('inline-block size-3 rounded-full', className)}
      style={{ backgroundColor: info.color }}
      title={info.label}
    />
  );
}

export default TierBadge;
