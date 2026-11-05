import { useEffect } from 'react';
import { useSeoMeta } from '@unhead/react';
import { Link } from 'react-router-dom';
import {
  AtSign,
  Bell,
  Heart,
  MessageSquare,
  Star,
  BadgeCheck,
  CircleCheck,
  CircleDot,
  CircleX,
  FilePen,
  GitCommitHorizontal,
  GitFork,
  GitMerge,
  GitPullRequest,
  type LucideIcon,
} from 'lucide-react';

import { Layout } from '@/components/Layout';
import { PushNotificationsPrompt } from '@/components/PushNotificationsPrompt';
import { UserAvatar } from '@/components/UserAvatar';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthor } from '@/hooks/useAuthor';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { shortNpub } from '@/lib/nostr';
import {
  CONTENT_KIND_LABEL,
  notificationAction,
  notificationPossessive,
} from '@/lib/notifications';
import { GIT_ISSUE_KIND, GIT_STATUS_APPLIED_KIND, GIT_STATUS_CLOSED_KIND } from '@/lib/git';
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
  fork: GitFork,
  update: FilePen,
  issue: CircleDot,
  pull: GitPullRequest,
  mention: AtSign,
  status: CircleDot,
  push: GitCommitHorizontal,
};

/** The icon for a notification; a state change shows the state it moved to. */
function NotificationIcon({ notification: n }: { notification: Notification }) {
  const className = 'size-4';
  if (n.type === 'status' && n.statusKind === GIT_STATUS_CLOSED_KIND) return <CircleX className={className} />;
  if (n.type === 'status' && n.statusKind === GIT_STATUS_APPLIED_KIND) {
    return n.content?.kind === GIT_ISSUE_KIND ? <CircleCheck className={className} /> : <GitMerge className={className} />;
  }
  const Icon = TYPE_ICON[n.type];
  return <Icon className={className} />;
}

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
  const metadata = author.data?.metadata;
  const actorName =
    metadata?.name || metadata?.display_name || shortNpub(notification.actorPubkey);

  const action = notificationAction(notification);
  const possessive = notificationPossessive(notification);
  const followed = notification.relation === 'followed';
  const contentLabel = notification.content
    ? CONTENT_KIND_LABEL[notification.content.kind] ?? 'content'
    : null;
  // A new issue or PR reads "opened an issue on your repo X: Subject".
  const subjectJoiner = notification.type === 'fork' ? ' as ' : ': ';

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
            {contentLabel && notification.content ? (
              <>
                {' '}
                {possessive && (
                  <span className="text-muted-foreground">
                    {possessive} {contentLabel}
                  </span>
                )}{' '}
                <Link
                  to={notification.content.href}
                  className="font-medium text-primary hover:underline"
                >
                  {notification.content.title}
                </Link>
                {followed && (
                  <span className="text-muted-foreground"> you follow</span>
                )}
              </>
            ) : (
              <span className="text-muted-foreground"> a thread you're in</span>
            )}
            {notification.subject && (
              <>
                <span className="text-muted-foreground">{subjectJoiner}</span>
                <Link
                  to={notification.subject.href}
                  className="font-medium text-primary hover:underline"
                >
                  {notification.subject.title}
                </Link>
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
          <NotificationIcon notification={notification} />
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
    description: 'Activity on your repos, issues, pull requests, NIPs, apps, and articles.',
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
            Issues, pull requests, and discussion on your repos and the threads you're in, mentions,
            and activity on your NIPs, apps, and articles and the NIPs you follow.
          </p>
        </header>

        <PushNotificationsPrompt />

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
                No notifications yet. When someone opens an issue on your repo,
                replies in a thread you're in, mentions you, or reacts to,
                reviews, or comments on something you published, you'll see it here.
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
