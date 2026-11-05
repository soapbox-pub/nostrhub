import { useMemo } from 'react';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useEncryptedSettings } from '@/hooks/useEncryptedSettings';
import { useNotificationContext } from '@/hooks/useNotificationContext';
import { dismissReadNotifications } from '@/lib/push/serviceWorker';
import { queryRelays } from '@/lib/queryRelays';
import {
  buildNotificationFilters,
  classifyNotification,
  contentFromEvent,
  type ClassifiedNotification,
  type NotificationContext,
} from '@/lib/notifications';

export type { NotificationType } from '@/lib/notifications';

export interface Notification extends ClassifiedNotification {
  /** True if newer than the read cursor. */
  isNew: boolean;
}

/** How many of each filter's newest events to ask for. */
const ACTIVITY_LIMIT = 200;

/** Fingerprint of a context, for the activity query's key. */
function contextKey(ctx: NotificationContext | undefined): string {
  if (!ctx) return '';
  return [
    ctx.pubkey,
    [...ctx.owned.keys()].sort().join(','),
    [...ctx.repos.keys()].sort().join(','),
    [...ctx.tickets.keys()].sort().join(','),
    [...ctx.followed.keys()].sort().join(','),
    ctx.readRelays.join(','),
    ctx.gitRelays.join(','),
  ].join('|');
}

/**
 * Fill in what a notification is about when the context didn't know: a reply
 * in a thread the user is in only by being tagged. One query for all of them.
 */
async function resolveRoots(
  items: ClassifiedNotification[],
  query: (filters: NostrFilter[]) => Promise<NostrEvent[]>,
): Promise<ClassifiedNotification[]> {
  const ids = new Set<string>();
  const addrs = new Map<string, NostrFilter>();
  for (const item of items) {
    if (item.content || !item.root) continue;
    if ('id' in item.root) {
      ids.add(item.root.id);
    } else {
      const [kind, author, ...d] = item.root.coordinate.split(':');
      if (kind && author && d.length) {
        addrs.set(item.root.coordinate, { kinds: [Number(kind)], authors: [author], '#d': [d.join(':')], limit: 1 });
      }
    }
  }
  if (!ids.size && !addrs.size) return items;

  const filters: NostrFilter[] = [...addrs.values()];
  if (ids.size) filters.push({ ids: [...ids] });
  const events = await query(filters).catch(() => [] as NostrEvent[]);

  const byRoot = new Map<string, ReturnType<typeof contentFromEvent>>();
  for (const event of events) {
    const content = contentFromEvent(event);
    if (!content) continue;
    byRoot.set(event.id, content);
    byRoot.set(content.coordinate, content);
  }
  return items.map((item) => {
    if (item.content || !item.root) return item;
    const key = 'id' in item.root ? item.root.id : item.root.coordinate;
    const content = byRoot.get(key);
    return content ? { ...item, content } : item;
  });
}

/**
 * Notifications for the logged-in user: what GitHub would tell you about, for
 * Nostr's git, plus activity on the NIPs, apps and articles you published and
 * the NIPs you follow. See `src/lib/notifications.ts` for the rules, which
 * push notifications share.
 *
 * Read state is tracked via the NIP-78 notification cursor in
 * {@link useEncryptedSettings}; any event newer than the cursor is `isNew`.
 */
export function useNotifications() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { settings, updateSettings } = useEncryptedSettings();
  const contextQuery = useNotificationContext();
  const ctx = contextQuery.data;

  const cursor = settings?.notifications?.cursor ?? 0;
  const pubkey = user?.pubkey;

  const activityQuery = useQuery({
    queryKey: ['notifications-activity', contextKey(ctx)],
    queryFn: async ({ signal }) => {
      if (!ctx) return [];
      const opts = { signal: AbortSignal.any([signal, AbortSignal.timeout(6000)]) };
      const { nip, git } = buildNotificationFilters(ctx);
      const withLimit = (filters: NostrFilter[]) => filters.map((f) => ({ ...f, limit: ACTIVITY_LIMIT }));

      const [nipEvents, gitEvents] = await Promise.all([
        nip.length ? nostr.query(withLimit(nip), opts).catch(() => [] as NostrEvent[]) : [],
        git.length ? queryRelays(nostr.group(ctx.gitRelays), withLimit(git), opts) : [],
      ]);

      const seen = new Set<string>();
      const items: ClassifiedNotification[] = [];
      for (const event of [...nipEvents, ...gitEvents]) {
        if (seen.has(event.id)) continue;
        seen.add(event.id);
        const item = classifyNotification(event, ctx);
        if (item) items.push(item);
      }

      const relays = [...new Set([...ctx.gitRelays, ...ctx.readRelays])];
      return resolveRoots(items, (filters) => queryRelays(nostr.group(relays), filters, opts));
    },
    enabled: !!ctx,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: true,
  });

  const notifications = useMemo<Notification[]>(() => {
    if (!pubkey) return [];
    return (activityQuery.data ?? [])
      .map((item) => ({ ...item, isNew: item.createdAt > cursor }))
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [activityQuery.data, pubkey, cursor]);

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
      // Read here is read in the system tray too.
      void dismissReadNotifications(newest);
    } catch (error) {
      console.error('Failed to mark notifications as read:', error);
    }
  };

  return {
    notifications,
    unreadCount,
    cursor,
    markAsRead,
    // Loading while the context is resolving, while the activity query is
    // fetching for the first time, or while a refetch is in flight with no data
    // yet — so the page never flashes the empty state before results settle.
    isLoading:
      contextQuery.isLoading ||
      activityQuery.isLoading ||
      (activityQuery.isFetching && (activityQuery.data?.length ?? 0) === 0),
    isError: contextQuery.isError || activityQuery.isError,
    error: contextQuery.error || activityQuery.error,
    refetch: activityQuery.refetch,
  };
}
