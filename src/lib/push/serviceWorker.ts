/**
 * Register `/sw.js` (built from `src/sw/`), which turns every push the napp
 * host delivers into a notification. A site with no `push` listener gets
 * nothing, so this has to happen before any subscription does.
 *
 * Resolves with the registration, or null when there is no service worker
 * support or registration fails.
 */
export async function registerPushWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  try {
    const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    await navigator.serviceWorker.ready;
    return registration;
  } catch (err) {
    console.error('[push] Service worker registration failed:', err);
    return null;
  }
}

/**
 * Close the notifications for activity at or before the read cursor, so
 * reading them in the app (on this device or, once settings sync, another)
 * clears them from the system tray too.
 */
export async function dismissReadNotifications(cursor: number): Promise<void> {
  if (cursor <= 0 || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration || typeof registration.getNotifications !== 'function') return;
    for (const notification of await registration.getNotifications()) {
      const data: unknown = notification.data;
      const createdAt = data && typeof data === 'object' && 'createdAt' in data ? data.createdAt : undefined;
      if (typeof createdAt === 'number' && createdAt <= cursor) notification.close();
    }
  } catch {
    // No notification introspection here; they stay until tapped.
  }
}
