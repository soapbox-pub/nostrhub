/**
 * NostrHub's service worker: turns napp pushes into notifications.
 *
 * A napp host (Tenna on Android and iOS, Din on the desktop) keeps the
 * filters from `buildPushSubscriptions()` open while NostrHub is closed and
 * delivers each match here as a `push` event carrying
 * `{ $type: 'napp.push.payload', event_id, event?, relays }` — the raw Nostr
 * event, unverified. `event` may be missing (iOS gives a push four
 * kilobytes), in which case it's fetched by id.
 *
 * Nothing the host matched is trusted: the event must be validly signed, and
 * must be news by the same rules the in-app bell uses
 * (`classifyNotification()`), judged against the context the page last wrote
 * to IndexedDB (`src/lib/push/workerState.ts`).
 *
 * Built into a single self-contained `/sw.js` by the `serviceWorker()` plugin
 * in `vite.config.ts`, and registered by `src/lib/push/serviceWorker.ts`.
 */

import type { NostrEvent } from '@nostrify/nostrify';

import {
  classifyNotification,
  contentFromEvent,
  describeNotification,
  notificationHref,
  type ClassifiedNotification,
  type NotificationContext,
} from '@/lib/notifications';
import type { NappPushPayload } from '@/lib/push/napp';
import { loadPushWorkerState } from '@/lib/push/workerState';
import { sanitizeUrl } from '@/lib/sanitizeUrl';

import { parseEvent } from './event';
import { requestEventFromAny } from './relays';

declare const self: ServiceWorkerGlobalScope;

const ICON = '/icon-192.png';
/** How long to wait for an event the push was too small to carry. */
const EVENT_TIMEOUT_MS = 5000;
/**
 * How long to wait for a name and a face. Short: a host binds a
 * notification's picture when it first draws it, and the whole handler has
 * twenty seconds on iOS.
 */
const PROFILE_TIMEOUT_MS = 2500;
const HEX64 = /^[0-9a-f]{64}$/;

/** `NotificationOptions` plus the fields lib.webworker leaves out. Hosts honour both. */
interface ShowOptions extends NotificationOptions {
  renotify?: boolean;
  timestamp?: number;
}

function show(title: string, options: ShowOptions): Promise<void> {
  return self.registration.showNotification(title, options);
}

/** Public wss relays the push named, then the ones the page knows about. */
function relaysFor(payload: Partial<NappPushPayload>, ctx: NotificationContext | undefined): string[] {
  const named = Array.isArray(payload.relays) ? payload.relays.filter((r): r is string => typeof r === 'string') : [];
  return [...new Set([...named, ...(ctx?.gitRelays ?? []), ...(ctx?.readRelays ?? [])])]
    .filter((url) => /^wss:\/\//i.test(url));
}

/**
 * Whether this host insists every push shows something. Tenna on iOS does
 * (the push already arrived as an alert); Android and Din don't.
 */
async function mustShow(): Promise<boolean> {
  try {
    const sub = await self.registration.pushManager?.getSubscription();
    return !sub || sub.options.userVisibleOnly !== false;
  } catch {
    return true;
  }
}

/**
 * Something for a push that turned out not to be news (the user's own
 * comment, say), on a host that must show something. Quiet, and always the
 * same tag, so a run of them is one entry.
 */
async function showNothing(): Promise<void> {
  if (!(await mustShow())) return;
  await show('NostrHub', {
    body: 'Checked for new activity.',
    icon: ICON,
    tag: 'nostrhub-quiet',
    silent: true,
    data: { url: '/notifications' },
  });
}

/** A display name and picture for the actor, or nulls. */
async function fetchProfile(relays: string[], pubkey: string): Promise<{ name: string | null; picture: string | null }> {
  const profile = await requestEventFromAny(
    relays,
    { kinds: [0], authors: [pubkey] },
    PROFILE_TIMEOUT_MS,
    (candidate) => {
      const event = parseEvent(candidate);
      if (!event || event.kind !== 0 || event.pubkey !== pubkey) return null;
      try {
        const meta = JSON.parse(event.content) as Record<string, unknown>;
        const pick = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
        return {
          name: (pick(meta.display_name) ?? pick(meta.name))?.slice(0, 40) ?? null,
          picture: sanitizeUrl(pick(meta.picture)) ?? null,
        };
      } catch {
        return null;
      }
    },
  );
  return profile ?? { name: null, picture: null };
}

/** What a reply in a thread the context doesn't know is about, from the thread itself. */
async function resolveRoot(n: ClassifiedNotification, relays: string[]): Promise<ClassifiedNotification> {
  if (n.content || !n.root) return n;
  let filter;
  if ('id' in n.root) {
    filter = { ids: [n.root.id] };
  } else {
    const [kind, author, ...d] = n.root.coordinate.split(':');
    if (!kind || !author || !d.length) return n;
    filter = { kinds: [Number(kind)], authors: [author], '#d': [d.join(':')] };
  }
  const content = await requestEventFromAny(relays, filter, PROFILE_TIMEOUT_MS, (candidate) => {
    const event = parseEvent(candidate);
    return event ? contentFromEvent(event) : null;
  });
  return content ? { ...n, content } : n;
}

function shortNpub(pubkey: string): string {
  return `${pubkey.slice(0, 8)}…`;
}

async function handlePush(payload: Partial<NappPushPayload>): Promise<void> {
  const state = await loadPushWorkerState();
  const ctx = state?.ctx;
  const relays = relaysFor(payload, ctx);

  let event: NostrEvent | null = parseEvent(payload.event);
  if (!event) {
    const id = typeof payload.event_id === 'string' && HEX64.test(payload.event_id) ? payload.event_id : null;
    if (id) {
      event = await requestEventFromAny(relays, { ids: [id] }, EVENT_TIMEOUT_MS, (candidate) => {
        const found = parseEvent(candidate);
        return found?.id === id ? found : null;
      });
    }
  }

  // Push was turned off, or this is another account's leftover subscription.
  if (!ctx) return showNothing();

  if (!event) {
    // The id is all there is; say something happened, without saying what.
    if (!(await mustShow())) return;
    return show('New activity on NostrHub', {
      body: 'Open NostrHub to see what happened.',
      icon: ICON,
      tag: typeof payload.event_id === 'string' ? `nostrhub-${payload.event_id}` : 'nostrhub-unknown',
      data: { url: '/notifications' },
    });
  }

  const classified = classifyNotification(event, ctx);
  if (!classified) return showNothing();

  const [n, profile] = await Promise.all([
    resolveRoot(classified, relays),
    fetchProfile([...ctx.readRelays, ...relays], event.pubkey),
  ]);
  const { title, body } = describeNotification(n, profile.name ?? shortNpub(event.pubkey));

  await show(title, {
    body,
    icon: profile.picture ?? ICON,
    // One per event: a later push for the same event replaces it.
    tag: `nostrhub-${event.id}`,
    renotify: true,
    timestamp: event.created_at * 1000,
    // `url` routes a tap even with no worker alive; `createdAt` is compared
    // with the read cursor by `dismissReadNotifications()`.
    data: { url: notificationHref(n), eventId: event.id, createdAt: event.created_at },
  });
}

self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload: Partial<NappPushPayload>;
  try {
    payload = event.data.json();
  } catch {
    return;
  }
  if (!payload || typeof payload !== 'object') return;
  event.waitUntil(handlePush(payload));
});

// A tap is routed by the host, which opens `data.url` itself the moment it
// lands (Tenna and Din both do, so a tap works even with no worker alive).
// Navigating here as well would route it twice — see Tenna's NAPP.md.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
});

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
