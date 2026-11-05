import { useEffect } from 'react';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNotificationContext } from '@/hooks/useNotificationContext';
import { applyPush, usePushNotifications } from '@/hooks/usePushNotifications';
import { getNappPush } from '@/lib/push/napp';

/**
 * Keeps push subscriptions current while push is on: a new repo, a thread
 * the user just commented on, a NIP they started following. Each time the
 * user's notification context changes the filters are rebuilt, and handed to
 * the host only if they differ from what it has.
 *
 * Logging out turns push off, so the next person on this device doesn't get
 * the last one's notifications.
 */
export function PushNotificationsSync() {
  const { user } = useCurrentUser();
  const { supported, enabled, disable } = usePushNotifications();
  const { data: ctx } = useNotificationContext();
  const pubkey = user?.pubkey;

  useEffect(() => {
    const push = getNappPush();
    if (!supported || !enabled || !push) return;
    if (!pubkey) {
      disable.mutate();
      return;
    }
    if (!ctx || ctx.pubkey !== pubkey) return;
    applyPush(push, ctx, { skipIfUnchanged: true }).catch((err) => {
      console.warn('[push] Failed to update subscriptions:', err);
    });
    // `disable` is a fresh object every render; the inputs above are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supported, enabled, pubkey, ctx]);

  return null;
}
