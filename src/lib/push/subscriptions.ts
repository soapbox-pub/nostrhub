/**
 * The notification filters, packed into what a napp host accepts.
 */

import type { NostrFilter } from '@nostrify/nostrify';

import { buildNotificationFilters, type NotificationContext } from '@/lib/notifications';
import { NAPP_LIMITS, type NappSubscription } from '@/lib/push/napp';
import { normalizeRelayUrls } from '@/lib/relayUrls';

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Split a filter whose longest list is over the host's cap into several that
 * together match the same. Only the one longest list is split; NostrHub's
 * filters never have two long ones.
 */
function splitFilter(filter: NostrFilter): NostrFilter[] {
  let longest: string | undefined;
  for (const [key, value] of Object.entries(filter)) {
    if (!Array.isArray(value) || value.length <= NAPP_LIMITS.filterEntries) continue;
    if (!longest || value.length > (filter[longest as keyof NostrFilter] as unknown[]).length) longest = key;
  }
  if (!longest) return [filter];
  const values = filter[longest as keyof NostrFilter] as unknown[];
  return chunk(values, NAPP_LIMITS.filterEntries).map((part) => ({ ...filter, [longest]: part }));
}

function pack(filters: NostrFilter[], relays: string[]): NappSubscription[] {
  const urls = normalizeRelayUrls(relays).slice(0, NAPP_LIMITS.relaysPerSubscription);
  if (!urls.length) return [];
  return chunk(filters.flatMap(splitFilter), NAPP_LIMITS.filtersPerSubscription)
    .map((group) => ({ filters: group, relays: urls }));
}

/**
 * Everything NostrHub would notify the user about, as napp subscriptions: NIP
 * activity on their read relays, git activity on git relays. Reactions are
 * left out (see `buildNotificationFilters()`).
 */
export function buildPushSubscriptions(ctx: NotificationContext): NappSubscription[] {
  const { nip, git } = buildNotificationFilters(ctx, { reactions: false });
  // Git first: it's what the user asked to hear about most, and if anything
  // is over the cap it's the tail that goes.
  return [...pack(git, ctx.gitRelays), ...pack(nip, ctx.readRelays)].slice(0, NAPP_LIMITS.subscriptions);
}
