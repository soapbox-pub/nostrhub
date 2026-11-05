/**
 * `window.napp.push` — the notification bridge a napp host injects into an
 * nsite. Tenna (Android and iOS) and Din (the desktop) both provide it, and
 * define it before any of the site's own scripts run. It is absent on the web,
 * so every use is feature-detected through {@link getNappPush}.
 *
 * A subscription is nothing new on the wire: an ordinary `REQ` the host keeps
 * open on the site's behalf while it's closed (or hands to a push service, on
 * iOS), delivering matches to the site's service worker as `push` events.
 * See Tenna's NAPP.md and `src/sw/worker.ts`.
 */

import type { NostrFilter } from '@nostrify/nostrify';

export interface NappSubscription {
  filters: NostrFilter[];
  relays: string[];
}

export interface NappPush {
  /** Replace the site's subscriptions. An empty array clears them. */
  set(subscriptions: NappSubscription[]): Promise<void>;
  /** The subscriptions as stored, after the host's normalization. */
  get(): Promise<NappSubscription[]>;
}

declare global {
  interface Window {
    readonly napp?: {
      readonly push?: NappPush;
    };
  }
}

/** Host-enforced limits. Exceeding any of them makes `set()` reject. */
export const NAPP_LIMITS = {
  subscriptions: 10,
  filtersPerSubscription: 10,
  relaysPerSubscription: 10,
  /** Entries in one filter list (`authors`, `#p`, …). */
  filterEntries: 500,
} as const;

/** What a push hands the service worker. */
export interface NappPushPayload {
  $type: 'napp.push.payload';
  event_id: string;
  /** Absent when the transport couldn't carry the whole event (iOS, over ~4 KB). */
  event?: unknown;
  relays: string[];
}

/** The push bridge, or undefined when the site isn't running inside a host. */
export function getNappPush(): NappPush | undefined {
  // `globalThis`, not `window`, so this module also type-checks against
  // lib.webworker.
  return (globalThis as { napp?: Window['napp'] }).napp?.push;
}
