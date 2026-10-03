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
import {
  APPROVE_LABEL_NAMESPACE,
  APPROVE_LABEL_VALUE,
  CUSTOM_NIP_KIND,
  isValidCustomNip,
  parseCustomNip,
  parseForkTags,
} from '@/lib/nips';
import { budNumberFromUrl, nipNumberFromUrl } from '@/lib/apps';

/** Reaction (NIP-25) kind. */
const REACTION_KIND = 7;
/** Comment (NIP-22) kind. */
const COMMENT_KIND = 1111;
/** Label (NIP-32) kind, used for approvals. */
const LABEL_KIND = 1985;

/** Categories of activity that can generate a notification. */
export type NotificationType = 'reaction' | 'review' | 'comment' | 'approval' | 'fork' | 'update';

/** Cap on followed NIPs queried for new revisions (one filter each). */
const MAX_FOLLOWED_UPDATE_FILTERS = 50;

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
  /** The user's content (or a followed NIP) this activity targets, if resolvable. */
  content?: OwnedContent;
  /** True when the target is a NIP the user follows rather than their own content. */
  followed: boolean;
  /** The new item the activity produced (the fork, for `type === 'fork'`). */
  subject?: { title: string; href: string };
  /** Reaction emoji/symbol (only for `type === 'reaction'`). */
  reaction?: string;
  /** Comment / review note text, if any. */
  text?: string;
  /** True if newer than the read cursor. */
  isNew: boolean;
}

/**
 * Targets a reaction/review/comment/approval may reference: addressable
 * coordinates (`a`/`A`) and, for official NIPs and BUDs, URLs (`i`/`I`).
 */
function referencedCoordinates(event: NostrEvent): string[] {
  const out: string[] = [];
  for (const tag of event.tags) {
    if ((tag[0] === 'a' || tag[0] === 'A' || tag[0] === 'i' || tag[0] === 'I') && tag[1]) out.push(tag[1]);
  }
  return out;
}

/** The source a kind-30817 fork points at (its `fork`-marked `a` or `i` tag). */
function forkSource(event: NostrEvent): string | undefined {
  const fork = parseForkTags(event.tags);
  if (!fork) return undefined;
  return fork.type === 'custom' ? fork.address : fork.url;
}

/** Notification-ready metadata for a followed official NIP / BUD URL. */
function followedUrlContent(url: string): OwnedContent | null {
  const bud = budNumberFromUrl(url);
  if (bud) return { coordinate: url, kind: CUSTOM_NIP_KIND, title: `BUD-${bud}`, href: `/bud/${bud}` };
  const nip = nipNumberFromUrl(url);
  if (nip) return { coordinate: url, kind: CUSTOM_NIP_KIND, title: `NIP-${nip}`, href: `/nip/${nip}` };
  return null;
}

/** A classified activity event, before the read cursor and content are applied. */
type RawNotification = Omit<Notification, 'isNew' | 'content' | 'followed'> & {
  /** Coordinate of the owned (or followed) content this targets, if any. */
  coordinate?: string;
};

/**
 * Notifications for activity on the current user's own NostrHub content and
 * on the NIPs they follow.
 *
 * For content the user authored — app listings (31990), community NIPs
 * (30817), articles (30023), git repos (30617), strategy-graph nodes (32473),
 * and Zapstore listings — it surfaces reactions (kind 7), NIP-compatibility
 * reviews (kind 31986), comments (kind 1111 via the `#A` coordinate), approval
 * labels (kind 1985), and forks of their NIPs (kind 30817 with a `fork`
 * marker).
 *
 * For followed NIPs (stored in encrypted settings) it surfaces new revisions,
 * comments (`#A` / `#I`), and forks published after the follow began.
 *
 * Events authored by the user themselves are excluded.
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

  // Followed NIPs, keyed by target (`30817:<pk>:<d>` or a GitHub blob URL) →
  // the Unix time the follow began.
  const followedNips = settings?.followedNips;
  const followedSince = useMemo(
    () => new Map((followedNips ?? []).map((f) => [f.target, f.since] as const)),
    [followedNips],
  );
  const followedKey = [...followedSince.keys()].sort().join(',');
  const followedCustom = useMemo(
    () => [...followedSince.keys()].filter((t) => t.startsWith(`${CUSTOM_NIP_KIND}:`)),
    [followedSince],
  );
  const followedUrls = useMemo(
    () => [...followedSince.keys()].filter((t) => t.startsWith('https://')),
    [followedSince],
  );

  // 1. Fetch all addressable content the user authored, plus the latest
  //    version of each followed community NIP, and index them by coordinate so
  //    we can attach the originating content to each notification.
  const contentQuery = useQuery({
    queryKey: ['notifications-owned-content', pubkey, followedKey],
    queryFn: async ({ signal }) => {
      const owned = new Map<string, OwnedContent>();
      const followed = new Map<string, OwnedContent>();
      if (!pubkey) return { owned, followed };

      const followedFilters = followedCustom.flatMap((coord) => {
        const [, author, d] = coord.split(':');
        return author && d !== undefined
          ? [{ kinds: [CUSTOM_NIP_KIND], authors: [author], '#d': [d], limit: 1 }]
          : [];
      });
      const events = await nostr.query(
        [{ kinds: [...OWNED_CONTENT_KINDS], authors: [pubkey], limit: 300 }, ...followedFilters],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) },
      );

      for (const event of events) {
        const content = toOwnedContent(event);
        if (!content) continue;
        if (event.pubkey === pubkey) owned.set(content.coordinate, content);
        else if (followedSince.has(content.coordinate)) followed.set(content.coordinate, content);
      }
      for (const url of followedUrls) {
        const content = followedUrlContent(url);
        if (content) followed.set(url, content);
      }
      return { owned, followed };
    },
    enabled: !!pubkey,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const byCoordinate = contentQuery.data?.owned;
  const followedContent = contentQuery.data?.followed;
  const coordinates = useMemo(
    () => (byCoordinate ? Array.from(byCoordinate.keys()) : []),
    [byCoordinate],
  );
  const coordinatesKey = coordinates.join(',');

  // 2. Fetch activity referencing the user's owned-content coordinates and
  //    followed NIPs.
  const activityQuery = useQuery({
    queryKey: ['notifications-activity', pubkey, coordinatesKey, followedKey],
    queryFn: async ({ signal }) => {
      if (!pubkey || !byCoordinate) return [];

      const querySignal = AbortSignal.any([signal, AbortSignal.timeout(5000)]);

      const ownedNips = coordinates.filter((c) => c.startsWith(`${CUSTOM_NIP_KIND}:`));
      // Followed NIPs the user doesn't own (owned ones are already covered).
      const followedCoords = followedCustom.filter((c) => !byCoordinate.has(c));
      const minSince = Math.min(...followedSince.values());

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
      // Forks of the user's NIPs, or of followed ones.
      if (ownedNips.length > 0 || followedCoords.length > 0) {
        filters.push({ kinds: [CUSTOM_NIP_KIND], '#a': [...ownedNips, ...followedCoords], limit: 200 });
      }
      if (followedCoords.length > 0) {
        filters.push({ kinds: [COMMENT_KIND], '#A': followedCoords, since: minSince, limit: 200 });
        // New revisions of followed NIPs, by their own author.
        for (const coord of followedCoords.slice(0, MAX_FOLLOWED_UPDATE_FILTERS)) {
          const [, author, d] = coord.split(':');
          filters.push({ kinds: [CUSTOM_NIP_KIND], authors: [author], '#d': [d], since: minSince, limit: 1 });
        }
      }
      if (followedUrls.length > 0) {
        filters.push(
          { kinds: [COMMENT_KIND], '#I': followedUrls, since: minSince, limit: 200 },
          { kinds: [CUSTOM_NIP_KIND], '#i': followedUrls, since: minSince, limit: 200 },
        );
      }
      if (filters.length === 0) return [];

      const events = await nostr.query(filters, { signal: querySignal });

      const ownedCoords = new Set(coordinates);
      const followedSet = new Set([...followedCoords, ...followedUrls]);
      const seen = new Set<string>();
      const items: RawNotification[] = [];

      for (const event of events) {
        if (seen.has(event.id)) continue;
        // Never notify the user about their own activity.
        if (event.pubkey === pubkey) continue;

        // Resolve which owned-content coordinate (or followed NIP) this targets.
        const refs = referencedCoordinates(event);
        let coord = refs.find((c) => ownedCoords.has(c)) ?? refs.find((c) => followedSet.has(c));

        let type: NotificationType | null = null;
        let reaction: string | undefined;
        let text: string | undefined;
        let subject: RawNotification['subject'];

        if (event.kind === CUSTOM_NIP_KIND) {
          if (!isValidCustomNip(event)) continue;
          const nip = parseCustomNip(event);
          const source = forkSource(event);
          if (followedSet.has(nip.address)) {
            // A new revision of a followed NIP.
            coord = nip.address;
            type = 'update';
          } else if (source && (ownedCoords.has(source) || followedSet.has(source))) {
            coord = source;
            type = 'fork';
            subject = { title: nip.title, href: `/${nip.naddr}` };
          } else {
            continue;
          }
          // Followed-NIP activity only counts from when the follow began.
          const since = followedSince.get(coord);
          if (!ownedCoords.has(coord) && since !== undefined && event.created_at < since) continue;
        } else if (coord && !ownedCoords.has(coord)) {
          // Followed NIPs only surface comments, forks, and revisions.
          if (event.kind !== COMMENT_KIND) continue;
          const since = followedSince.get(coord);
          if (since !== undefined && event.created_at < since) continue;
          type = 'comment';
          text = event.content.trim() || undefined;
        } else if (event.kind === REACTION_KIND) {
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
          subject,
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
      .map(({ coordinate, ...item }) => {
        const owned = coordinate ? byCoordinate.get(coordinate) : undefined;
        return {
          ...item,
          content: owned ?? (coordinate ? followedContent?.get(coordinate) : undefined),
          followed: !owned && !!coordinate,
          isNew: item.createdAt > cursor,
        };
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [activityQuery.data, pubkey, byCoordinate, followedContent, cursor]);

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
