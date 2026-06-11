import { formatDistanceToNow } from 'date-fns';
import { TIERS, TRACKED_NIPS, type ReviewReport } from '@/lib/appReviews';
import { TierBadge } from '@/components/TierBadge';
import { UserAvatar } from '@/components/UserAvatar';
import { useAuthor } from '@/hooks/useAuthor';
import { shortNpub } from '@/lib/nostr';
import { Card, CardContent } from '@/components/ui/card';

/** A single kind 31986 compatibility report, tier-color accented. */
export function AppReviewCard({ review }: { review: ReviewReport }) {
  const author = useAuthor(review.authorPubkey);
  const metadata = author.data?.metadata;
  const displayName =
    metadata?.name || metadata?.display_name || shortNpub(review.authorPubkey);
  const tierInfo = TIERS[review.tier];
  const nipInfo = TRACKED_NIPS.find((n) => n.id === review.nip);
  const timeAgo = formatDistanceToNow(new Date(review.createdAt * 1000), { addSuffix: true });

  return (
    <Card className="gap-0 overflow-hidden border-border/60 py-0">
      <div className="h-1" style={{ backgroundColor: tierInfo.color }} aria-hidden="true" />
      <CardContent className="px-4 py-4">
        <div className="flex items-start gap-3">
          <UserAvatar pubkey={review.authorPubkey} size="sm" className="shrink-0" />

          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">{displayName}</span>
              <span className="text-xs text-muted-foreground">{timeAgo}</span>
              <span className="text-muted-foreground" aria-hidden="true">·</span>
              <span className="font-mono text-xs text-muted-foreground">
                {nipInfo
                  ? `${nipInfo.id.replace('nip-', '').toUpperCase()} ${nipInfo.name}`
                  : review.nip}
              </span>
              <TierBadge tier={review.tier} size="sm" />
            </div>

            {review.content && (
              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/80">
                {review.content}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default AppReviewCard;
