import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useNotificationContext } from '@/hooks/useNotificationContext';
import type { NotificationContext } from '@/lib/notifications';
import { getNappPush, type NappPush } from '@/lib/push/napp';
import { registerPushWorker } from '@/lib/push/serviceWorker';
import { buildPushSubscriptions } from '@/lib/push/subscriptions';
import { clearPushWorkerState, putPushWorkerState } from '@/lib/push/workerState';

/** Fingerprint of the last subscriptions that landed, so an unchanged set is skipped. */
const APPLIED_KEY = 'nostrhub:push-applied';
const ENABLED_QUERY_KEY = ['napp-push-enabled'];

/** FNV-1a, hex. Only has to tell one set of inputs from the next. */
function fingerprint(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

/**
 * Hand the host the filters for `ctx`, and the worker the context to judge
 * what they match. With `skipIfUnchanged`, the host isn't troubled when the
 * filters are what it already has.
 */
export async function applyPush(
  push: NappPush,
  ctx: NotificationContext,
  { skipIfUnchanged = false }: { skipIfUnchanged?: boolean } = {},
): Promise<void> {
  const subscriptions = buildPushSubscriptions(ctx);
  const applied = fingerprint(JSON.stringify([ctx.pubkey, subscriptions]));

  // The worker's copy first: a push can arrive the moment `set()` returns,
  // and a worker with no context can't tell what it's looking at.
  await registerPushWorker();
  await putPushWorkerState(ctx);

  if (skipIfUnchanged && localStorage.getItem(APPLIED_KEY) === applied) return;
  await push.set(subscriptions);
  localStorage.setItem(APPLIED_KEY, applied);
}

/** Stop pushing: clear the host's subscriptions and the worker's context. */
export async function clearPush(push: NappPush | undefined): Promise<void> {
  localStorage.removeItem(APPLIED_KEY);
  await push?.set([]);
  await clearPushWorkerState().catch(() => {});
}

/**
 * Push notifications through a napp host (Tenna on phones, Din on the
 * desktop), which keeps NostrHub's filters watched while it's closed.
 *
 * `supported` is false on the web, where there is no host. Whether push is on
 * is the host's to say: it's on when the host holds subscriptions for us.
 */
export function usePushNotifications() {
  const push = getNappPush();
  const queryClient = useQueryClient();
  const contextQuery = useNotificationContext();

  const enabledQuery = useQuery({
    queryKey: ENABLED_QUERY_KEY,
    queryFn: async () => {
      try {
        return ((await push?.get()) ?? []).length > 0;
      } catch (err) {
        console.warn('[push] Failed to read napp subscriptions:', err);
        return false;
      }
    },
    enabled: !!push,
    staleTime: Infinity,
  });

  const enable = useMutation({
    // The host asks the user ("Send notifications") inside `set()`, then the
    // OS; either refusal rejects with an Error that says why.
    mutationFn: async () => {
      if (!push) throw new Error('Push notifications need the NostrHub app in Tenna or Din.');
      const ctx = contextQuery.data;
      if (!ctx) throw new Error('Still loading your activity. Try again in a moment.');
      await applyPush(push, ctx);
    },
    onSuccess: () => queryClient.setQueryData(ENABLED_QUERY_KEY, true),
  });

  const disable = useMutation({
    mutationFn: () => clearPush(push),
    onSuccess: () => queryClient.setQueryData(ENABLED_QUERY_KEY, false),
  });

  return {
    supported: !!push,
    enabled: enabledQuery.data ?? false,
    /** Whether the host has said yet whether push is on. */
    isLoading: !!push && enabledQuery.isLoading,
    /** Whether there's enough to subscribe with: the user's context has loaded. */
    ready: !!contextQuery.data,
    enable,
    disable,
  };
}
