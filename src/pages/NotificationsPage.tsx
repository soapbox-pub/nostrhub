import { useEffect } from 'react';
import { useSeoMeta } from '@unhead/react';
import { Link } from 'react-router-dom';
import {
  Bell,
  Heart,
  MessageSquare,
  Star,
  BadgeCheck,
  type LucideIcon,
} from 'lucide-react';

import { Layout } from '@/components/Layout';
import { UserAvatar } from '@/components/UserAvatar';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthor } from '@/hooks/useAuthor';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { shortNpub } from '@/lib/nostr';
import { CONTENT_KIND_LABEL } from '@/lib/notifications';
import {
  useNotifications,
  type Notification,
  type NotificationType,
} from '@/hooks/useNotifications';
import { cn } from '@/lib/utils';

const TYPE_ICON: Record<NotificationType, LucideIcon> = {
  reaction: Heart,
  comment: MessageSquare,
  review: Star,
  approval: BadgeCheck,
};

const TYPE_ACTION: Record<NotificationType, string> = {
  reaction: 'reacted to',
  comment: 'commented on',
  review: 'reviewed',
  approval: 'approved',
};

/** Relative-time formatter using the platform Intl API (no extra deps). */
const RELATIVE = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
function timeAgo(unixSeconds: number): string {
  const diffSec = Math.round(unixSeconds - Date.now() / 1000);
  const abs = Math.abs(diffSec);
  if (abs < 60) return RELATIVE.format(Math.round(diffSec), 'second');
  if (abs < 3600) return RELATIVE.format(Math.round(diffSec / 60), 'minute');
  if (abs < 86400) return RELATIVE.format(Math.round(diffSec / 3600), 'hour');
  if (abs < 2592000) return RELATIVE.format(Math.round(diffSec / 86400), 'day');
  if (abs < 31536000) return RELATIVE.format(Math.round(diffSec / 2592000), 'month');
  return RELATIVE.format(Math.round(diffSec / 31536000), 'year');
}

function NotificationRow({ notification }: { notification: Notification }) {
  const author = useAuthor(notification.actorPubkey);
  const Icon = TYPE_ICON[notification.type];
  const metadata = author.data?.metadata;
  const actorName =
    metadata?.name || metadata?.display_name || shortNpub(notification.actorPubkey);

  const action = TYPE_ACTION[notification.type];
  const contentLabel = notification.content
    ? CONTENT_KIND_LABEL[notification.content.kind] ?? 'content'
    : null;

  return (
    <Card
      className={cn(
        'transition-colors',
        notification.isNew ? 'border-primary/40 bg-primary/5' : 'bg-card/80',
      )}
    >
      <CardContent className="flex items-start gap-3 p-4">
        <Link to={`/${notification.actorPubkey}`} className="shrink-0">
          <UserAvatar pubkey={notification.actorPubkey} />
        </Link>

        <div className="min-w-0 flex-1">
          <p className="text-sm leading-relaxed text-foreground">
            <Link
              to={`/${notification.actorPubkey}`}
              className="font-semibold hover:underline"
            >
              {actorName}
            </Link>{' '}
            <span className="text-muted-foreground">{action}</span>
            {contentLabel && (
              <>
                {' '}
                <span className="text-muted-foreground">your {contentLabel}</span>
                {notification.content && (
                  <>
                    {' '}
                    <Link
                      to={notification.content.href}
                      className="font-medium text-primary hover:underline"
                    >
                      {notification.content.title}
                    </Link>
                  </>
                )}
              </>
            )}
            {notification.type === 'reaction' && notification.reaction && (
              <span className="ml-1">
                {notification.reaction === '+'
                  ? '\u{1F44D}'
                  : notification.reaction}
              </span>
            )}
          </p>

          {notification.text && (
            <p className="mt-1.5 line-clamp-3 whitespace-pre-wrap break-words text-sm text-foreground/80">
              {notification.text}
            </p>
          )}

          <span className="mt-1.5 block text-xs text-muted-foreground">
            {timeAgo(notification.createdAt)}
          </span>
        </div>

        <div
          className="shrink-0 rounded-full bg-primary/10 p-2 text-primary"
          aria-hidden="true"
        >
          <Icon className="size-4" />
        </div>
      </CardContent>
    </Card>
  );
}

function RowSkeleton() {
  return (
    <Card>
      <CardContent className="flex items-start gap-3 p-4">
        <Skeleton className="size-10 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-3/5" />
          <Skeleton className="h-3 w-2/5" />
        </div>
      </CardContent>
    </Card>
  );
}

export function NotificationsPage() {
  const { user } = useCurrentUser();
  const { notifications, isLoading, markAsRead } = useNotifications();

  useSeoMeta({
    title: 'Notifications · NostrHub',
    description: 'Activity on the apps, NIPs, articles, and repos you created.',
  });

  // Mark everything read shortly after the page is viewed.
  useEffect(() => {
    if (!user || notifications.length === 0) return;
    const id = setTimeout(() => {
      void markAsRead();
    }, 1000);
    return () => clearTimeout(id);
    // markAsRead identity changes each render; gate on stable inputs instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.pubkey, notifications.length]);

  return (
    <Layout>
      <div className="space-y-6">
        <header className="space-y-1">
          <h1 className="flex items-center gap-2 font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            <Bell className="size-6 text-primary" />
            Notifications
          </h1>
          <p className="text-muted-foreground">
            Activity on the apps, NIPs, articles, and repos you created.
          </p>
        </header>

        {!user ? (
          <Card className="border-dashed">
            <CardContent className="px-8 py-12 text-center">
              <p className="mx-auto max-w-sm text-muted-foreground">
                Log in to see activity on the content you've published.
              </p>
            </CardContent>
          </Card>
        ) : isLoading ? (
          <div className="space-y-3">
            <RowSkeleton />
            <RowSkeleton />
            <RowSkeleton />
          </div>
        ) : notifications.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="px-8 py-12 text-center">
              <p className="mx-auto max-w-sm text-muted-foreground">
                No notifications yet. When someone reacts to, reviews, comments
                on, or approves something you published, you'll see it here.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {notifications.map((n) => (
              <NotificationRow key={n.id} notification={n} />
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}

export default NotificationsPage;
