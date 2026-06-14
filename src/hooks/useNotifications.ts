import { useMemo } from 'react';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useEncryptedSettings } from '@/hooks/useEncryptedSettings';
import {
  OWNED_CONTENT_KINDS,
  toOwnedContent,
  type OwnedContent,
} from '@/lib/notifications';
import { APP_REVIEW_KIND, REVIEW_LABEL, parseReviewEvent } from '@/lib/appReviews';
import { APPROVE_LABEL_NAMESPACE, APPROVE_LABEL_VALUE } from '@/lib/nips';

/** Reaction (NIP-25) kind. */
const REACTION_KIND = 7;
/** Comment (NIP-22) kind. */
const COMMENT_KIND = 1111;
/** Label (NIP-32) kind, used for approvals. */
const LABEL_KIND = 1985;

/** Categories of activity that can generate a notification. */
export type NotificationType = 'reaction' | 'review' | 'comment' | 'approval';

export interface Notification {
  /** Underlying Nostr event id (stable React key). */
  id: string;
  /** The raw source event. */
  event: NostrEvent;
  /** Activity category. */
  type: NotificationType;
  /** Pubkey of the actor who generated the activity. */
  actorPubkey: string;
  /** Unix timestamp (seconds) of the activity. */
  createdAt: number;
  /** The user's content this activity targets, if resolvable. */
  content?: OwnedContent;
  /** Reaction emoji/symbol (only for `type === 'reaction'`). */
  reaction?: string;
  /** Comment / review note text, if any. */
  text?: string;
  /** True if newer than the read cursor. */
  isNew: boolean;
}

/** Coordinates a reaction/review/comment/approval may carry, lowercase + uppercase. */
function referencedCoordinates(event: NostrEvent): string[] {
  const out: string[] = [];
  for (const tag of event.tags) {
    if ((tag[0] === 'a' || tag[0] === 'A') && tag[1]) out.push(tag[1]);
  }
  return out;
}

/** A classified activity event, before the read cursor and content are applied. */
type RawNotification = Omit<Notification, 'isNew' | 'content'> & {
  /** Coordinate of the owned content this targets, if any. */
  coordinate?: string;
};

/**
 * Notifications for activity on the current user's own NostrHub content.
 *
 * Surfaces reactions (kind 7), NIP-compatibility reviews (kind 31986), comments
 * (kind 1111 via the `#A` coordinate), approval labels (kind 1985), and direct
 * profile mentions (`#p`) that reference any content the user authored — app
 * listings (31990), community NIPs (30817), articles (30023), git repos
 * (30617), and strategy-graph nodes (32473). Events authored by the user
 * themselves are excluded.
 *
 * Read state is tracked via the NIP-78 notification cursor in
 * {@link useEncryptedSettings}; any event newer than the cursor is `isNew`.
 */
export function useNotifications() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { settings, updateSettings } = useEncryptedSettings();

  const cursor = settings?.notifications?.cursor ?? 0;
  const pubkey = user?.pubkey;

  // 1. Fetch all addressable content the user authored, and index it by
  //    coordinate so we can attach the originating content to each notification.
  const contentQuery = useQuery({
    queryKey: ['notifications-owned-content', pubkey],
    queryFn: async ({ signal }) => {
      if (!pubkey) return new Map<string, OwnedContent>();
      const events = await nostr.query(
        [{ kinds: [...OWNED_CONTENT_KINDS], authors: [pubkey], limit: 300 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) },
      );

      const byCoordinate = new Map<string, OwnedContent>();
      for (const event of events) {
        const content = toOwnedContent(event);
        if (content) byCoordinate.set(content.coordinate, content);
      }
      return byCoordinate;
    },
    enabled: !!pubkey,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const byCoordinate = contentQuery.data;
  const coordinates = useMemo(
    () => (byCoordinate ? Array.from(byCoordinate.keys()) : []),
    [byCoordinate],
  );
  const coordinatesKey = coordinates.join(',');

  // 2. Fetch activity referencing the user's owned-content coordinates.
  const activityQuery = useQuery({
    queryKey: ['notifications-activity', pubkey, coordinatesKey],
    queryFn: async ({ signal }) => {
      if (!pubkey || !byCoordinate) return [];

      const querySignal = AbortSignal.any([signal, AbortSignal.timeout(5000)]);

      const filters: Parameters<typeof nostr.query>[0] = [];
      if (coordinates.length > 0) {
        filters.push(
          { kinds: [REACTION_KIND], '#a': coordinates, limit: 200 },
          { kinds: [COMMENT_KIND], '#A': coordinates, limit: 200 },
          {
            kinds: [APP_REVIEW_KIND],
            '#l': [REVIEW_LABEL],
            '#a': coordinates,
            limit: 200,
          },
          {
            kinds: [LABEL_KIND],
            '#L': [APPROVE_LABEL_NAMESPACE],
            '#l': [APPROVE_LABEL_VALUE],
            '#a': coordinates,
            limit: 200,
          },
        );
      }

      const events = await nostr.query(filters, { signal: querySignal });

      const knownCoords = new Set(coordinates);
      const seen = new Set<string>();
      const items: RawNotification[] = [];

      for (const event of events) {
        if (seen.has(event.id)) continue;
        // Never notify the user about their own activity.
        if (event.pubkey === pubkey) continue;

        // Resolve which owned-content coordinate this activity targets.
        const coord = referencedCoordinates(event).find((c) => knownCoords.has(c));

        let type: NotificationType | null = null;
        let reaction: string | undefined;
        let text: string | undefined;

        if (event.kind === REACTION_KIND) {
          if (!coord) continue;
          type = 'reaction';
          reaction = event.content.trim() || '+';
        } else if (event.kind === APP_REVIEW_KIND) {
          if (!coord) continue;
          // Only count valid NIP-compatibility reports on the user's apps.
          const report = parseReviewEvent(event);
          if (!report) continue;
          type = 'review';
          text = event.content.trim() || undefined;
        } else if (event.kind === LABEL_KIND) {
          if (!coord) continue;
          type = 'approval';
        } else if (event.kind === COMMENT_KIND) {
          // Only notify for comments that target one of the user's own core
          // content coordinates (#A). Generic NIP-22 comments on notes, URLs,
          // hashtags, or other people's content are ignored even if they tag
          // the user.
          if (!coord) continue;
          type = 'comment';
          text = event.content.trim() || undefined;
        }

        if (!type) continue;

        seen.add(event.id);
        items.push({
          id: event.id,
          event,
          type,
          actorPubkey: event.pubkey,
          createdAt: event.created_at,
          reaction,
          text,
          coordinate: coord,
        });
      }

      return items;
    },
    enabled: !!pubkey && byCoordinate !== undefined,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: true,
  });

  const notifications = useMemo<Notification[]>(() => {
    if (!pubkey || !byCoordinate) return [];
    return (activityQuery.data ?? [])
      .map(({ coordinate, ...item }) => ({
        ...item,
        content: coordinate ? byCoordinate.get(coordinate) : undefined,
        isNew: item.createdAt > cursor,
      }))
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [activityQuery.data, pubkey, byCoordinate, cursor]);

  const unreadCount = useMemo(
    () => notifications.filter((n) => n.isNew).length,
    [notifications],
  );

  // Advance the read cursor to the newest notification timestamp.
  const markAsRead = async () => {
    if (notifications.length === 0) return;
    const newest = notifications[0].createdAt; // sorted newest-first
    if (newest <= cursor) return;
    if (!updateSettings) return;
    try {
      await updateSettings.mutateAsync({
        notifications: { ...(settings?.notifications ?? {}), cursor: newest },
      });
    } catch (error) {
      console.error('Failed to mark notifications as read:', error);
    }
  };

  return {
    notifications,
    unreadCount,
    cursor,
    markAsRead,
    // Loading while owned content is resolving, while the activity query is
    // fetching for the first time, or while a refetch is in flight with no data
    // yet — so the page never flashes the empty state before results settle.
    isLoading:
      contentQuery.isLoading ||
      activityQuery.isLoading ||
      (activityQuery.isFetching && (activityQuery.data?.length ?? 0) === 0),
    isError: contentQuery.isError || activityQuery.isError,
    error: contentQuery.error || activityQuery.error,
    refetch: activityQuery.refetch,
  };
}
