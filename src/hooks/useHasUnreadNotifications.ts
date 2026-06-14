import { useNotifications } from '@/hooks/useNotifications';

/**
 * Lightweight boolean indicator for the notification dot in navigation.
 *
 * Reuses the shared notifications queries (deduped by TanStack Query), so
 * mounting this alongside the Notifications page adds no extra relay traffic.
 */
export function useHasUnreadNotifications(): boolean {
  const { unreadCount } = useNotifications();
  return unreadCount > 0;
}
