import type { NostrEvent } from '@nostrify/nostrify';
import { APP_HANDLER_KIND } from '@/lib/apps';

/**
 * ProtonDB-style NIP compatibility reports for Nostr apps, interoperable with
 * the Borkstr directory. Reports are kind 31986 addressable events (proposed
 * NIP-85 Reviews) self-labeled via NIP-32 with the `borkstr` namespace and the
 * `nip-compatibility` label, targeting an app's kind 31990 listing.
 */
export const APP_REVIEW_KIND = 31986;

/** NIP-32 label namespace + value shared with Borkstr for interoperability. */
export const REVIEW_LABEL_NAMESPACE = 'borkstr';
export const REVIEW_LABEL = 'nip-compatibility';

/** The four compatibility tiers, inspired by ProtonDB. */
export type CompatTier = 'flawless' | 'incomplete' | 'isolated' | 'borked';

export interface TierInfo {
  id: CompatTier;
  label: string;
  description: string;
  /** Inline CSS color (kept inline so untrusted data never reaches CSS). */
  color: string;
  /** Fixed rating published when a user selects this tier. */
  ratingValue: number;
}

export const TIERS: Record<CompatTier, TierInfo> = {
  flawless: {
    id: 'flawless',
    label: 'Flawless',
    description: 'Every expected feature is interoperable with all other apps',
    color: 'hsl(142, 71%, 45%)',
    ratingValue: 1.0,
  },
  incomplete: {
    id: 'incomplete',
    label: 'Incomplete',
    description: "Doesn't comply with the entire NIP; things are missing",
    color: 'hsl(48, 96%, 53%)',
    ratingValue: 0.6,
  },
  isolated: {
    id: 'isolated',
    label: 'Isolated',
    description: 'Not interoperable with other clients',
    color: 'hsl(25, 95%, 53%)',
    ratingValue: 0.3,
  },
  borked: {
    id: 'borked',
    label: 'Borked',
    description: "Doesn't load basic events or crashes",
    color: 'hsl(0, 72%, 51%)',
    ratingValue: 0.1,
  },
};

export const TIER_ORDER: CompatTier[] = ['flawless', 'incomplete', 'isolated', 'borked'];

/** Map a 0-1 rating value to a tier. */
export function ratingToTier(rating: number): CompatTier {
  if (rating >= 0.75) return 'flawless';
  if (rating >= 0.5) return 'incomplete';
  if (rating >= 0.25) return 'isolated';
  return 'borked';
}

/** Compute the median of an array of numbers. */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Well-known NIPs that are commonly supported by clients. */
export const TRACKED_NIPS = [
  { id: 'nip-01', name: 'Basic Protocol', description: 'Basic protocol flow' },
  { id: 'nip-02', name: 'Follow List', description: 'Contact/follow lists' },
  { id: 'nip-05', name: 'NIP-05', description: 'DNS identifier verification' },
  { id: 'nip-07', name: 'NIP-07', description: 'Browser extension signing' },
  { id: 'nip-09', name: 'Event Deletion', description: 'Event deletion requests' },
  { id: 'nip-10', name: 'Text Notes', description: 'Text notes and threads' },
  { id: 'nip-17', name: 'Private DMs', description: 'Private direct messages' },
  { id: 'nip-18', name: 'Reposts', description: 'Repost events' },
  { id: 'nip-19', name: 'Bech32 Entities', description: 'npub, note, nevent, naddr encoding' },
  { id: 'nip-21', name: 'nostr: URIs', description: 'nostr: URI scheme' },
  { id: 'nip-22', name: 'Comments', description: 'Threaded comments' },
  { id: 'nip-23', name: 'Long-form', description: 'Long-form content/articles' },
  { id: 'nip-25', name: 'Reactions', description: 'Reactions (likes/dislikes)' },
  { id: 'nip-27', name: 'Text References', description: 'Text note references' },
  { id: 'nip-28', name: 'Public Chat', description: 'Public chat channels' },
  { id: 'nip-29', name: 'Relay Groups', description: 'Relay-based groups' },
  { id: 'nip-30', name: 'Custom Emoji', description: 'Custom emoji reactions' },
  { id: 'nip-32', name: 'Labeling', description: 'Content labeling' },
  { id: 'nip-42', name: 'Auth', description: 'Client-relay authentication' },
  { id: 'nip-44', name: 'Encryption', description: 'Encrypted payloads' },
  { id: 'nip-46', name: 'Remote Signing', description: 'Nostr Connect / bunker' },
  { id: 'nip-47', name: 'Wallet Connect', description: 'Nostr Wallet Connect' },
  { id: 'nip-50', name: 'Search', description: 'Search capability' },
  { id: 'nip-51', name: 'Lists', description: 'Lists and sets' },
  { id: 'nip-53', name: 'Live Activities', description: 'Live streaming' },
  { id: 'nip-57', name: 'Zaps', description: 'Lightning zaps' },
  { id: 'nip-58', name: 'Badges', description: 'Badge definitions and awards' },
  { id: 'nip-65', name: 'Relay List', description: 'Relay list metadata' },
  { id: 'nip-89', name: 'App Handlers', description: 'Recommended application handlers' },
  { id: 'nip-92', name: 'Media Attachments', description: 'Media attachments' },
];

/** Parsed review data from a kind 31986 compatibility report. */
export interface ReviewReport {
  event: NostrEvent;
  /** Address of the reviewed app: "31990:<pubkey>:<d-tag>". */
  appAddress: string;
  /** NIP identifier being rated, e.g. "nip-17". */
  nip: string;
  rating: number;
  tier: CompatTier;
  content: string;
  authorPubkey: string;
  createdAt: number;
}

/** Validate and parse a kind 31986 compatibility report. */
export function parseReviewEvent(event: NostrEvent): ReviewReport | null {
  if (event.kind !== APP_REVIEW_KIND) return null;

  // Must carry the shared compatibility label (NIP-32)
  const hasLabel = event.tags.some(
    ([name, value, ns]) =>
      name === 'l' && value === REVIEW_LABEL && ns === REVIEW_LABEL_NAMESPACE,
  );
  if (!hasLabel) return null;

  // Must target a kind 31990 app listing
  const aTag = event.tags.find(
    ([name, value]) => name === 'a' && value?.startsWith(`${APP_HANDLER_KIND}:`),
  );
  if (!aTag) return null;

  // Which NIP is being rated
  const nipTag = event.tags.find(([name, value]) => name === 't' && value?.startsWith('nip-'));
  if (!nipTag) return null;

  const ratingTag = event.tags.find(([name]) => name === 'rating');
  if (!ratingTag) return null;

  const rating = parseFloat(ratingTag[1]);
  if (isNaN(rating) || rating < 0 || rating > 1) return null;

  return {
    event,
    appAddress: aTag[1],
    nip: nipTag[1],
    rating,
    tier: ratingToTier(rating),
    content: event.content,
    authorPubkey: event.pubkey,
    createdAt: event.created_at,
  };
}

export interface TierAggregate {
  tier: CompatTier;
  rating: number;
  count: number;
}

/**
 * Aggregate reviews into a per-NIP tier map and an overall tier.
 *
 * Reviews are grouped by NIP, the median rating per NIP maps to its tier, and
 * the overall tier is the median of the per-NIP medians. Medians (rather than
 * means) blunt the impact of outlier ratings.
 */
export function aggregateReviews(reviews: ReviewReport[]): {
  perNip: Map<string, TierAggregate>;
  overall: TierAggregate | null;
} {
  const nipGroups = new Map<string, number[]>();

  for (const review of reviews) {
    const existing = nipGroups.get(review.nip) || [];
    existing.push(review.rating);
    nipGroups.set(review.nip, existing);
  }

  const perNip = new Map<string, TierAggregate>();
  const allRatings: number[] = [];

  for (const [nip, ratings] of nipGroups) {
    const med = median(ratings);
    perNip.set(nip, { tier: ratingToTier(med), rating: med, count: ratings.length });
    allRatings.push(med);
  }

  const overall: TierAggregate | null =
    allRatings.length > 0
      ? {
          tier: ratingToTier(median(allRatings)),
          rating: median(allRatings),
          count: reviews.length,
        }
      : null;

  return { perNip, overall };
}
