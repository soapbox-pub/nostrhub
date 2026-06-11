import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import {
  APP_REVIEW_KIND,
  REVIEW_LABEL,
  REVIEW_LABEL_NAMESPACE,
  TIERS,
  type CompatTier,
} from '@/lib/appReviews';

interface SubmitReviewParams {
  /** The app's address coordinate, e.g. "31990:<pubkey>:<d-tag>". */
  appAddress: string;
  /** The app publisher's pubkey. */
  appPubkey: string;
  /** NIP identifier, e.g. "nip-17". */
  nip: string;
  tier: CompatTier;
  /** The user's written report (may be empty). */
  content: string;
}

/**
 * Publish kind 31986 NIP compatibility reports, using the Borkstr-compatible
 * schema (NIP-32 `borkstr`/`nip-compatibility` label, 0-1 `rating` tag, and a
 * `d` tag of `<app-address>:<nip>` so re-rating replaces the prior report).
 */
export function useSubmitAppReview() {
  const { mutateAsync: publishEvent } = useNostrPublish();
  const queryClient = useQueryClient();
  const [isPending, setIsPending] = useState(false);

  const submitReview = async (params: SubmitReviewParams) => {
    const { appAddress, appPubkey, nip, tier, content } = params;

    const event = await publishEvent({
      kind: APP_REVIEW_KIND,
      content,
      tags: [
        ['a', appAddress],
        ['p', appPubkey],
        ['k', '31990'],
        ['d', `${appAddress}:${nip}`],
        ['rating', TIERS[tier].ratingValue.toString(), nip],
        ['L', REVIEW_LABEL_NAMESPACE],
        ['l', REVIEW_LABEL, REVIEW_LABEL_NAMESPACE],
        ['t', nip],
        ['alt', 'Borkstr NIP compatibility report'],
      ],
    });

    await queryClient.invalidateQueries({ queryKey: ['app-reviews'] });

    return event;
  };

  /** Submit multiple NIP reviews for the same app in batch. */
  const submitBatchReviews = async (params: {
    appAddress: string;
    appPubkey: string;
    reviews: { nip: string; tier: CompatTier; content: string }[];
  }) => {
    setIsPending(true);
    try {
      for (const review of params.reviews) {
        await submitReview({
          appAddress: params.appAddress,
          appPubkey: params.appPubkey,
          nip: review.nip,
          tier: review.tier,
          content: review.content,
        });
      }
    } finally {
      setIsPending(false);
    }
  };

  return { submitReview, submitBatchReviews, isPending };
}
