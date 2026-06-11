import { AlertCircle, Ban, CheckCircle2 } from 'lucide-react';
import type { CompatTier } from '@/lib/appReviews';

/** Icon for each compatibility tier, shared by badges, filters, and forms. */
export const TIER_ICONS: Record<CompatTier, typeof CheckCircle2> = {
  flawless: CheckCircle2,
  incomplete: AlertCircle,
  isolated: AlertCircle,
  borked: Ban,
};
