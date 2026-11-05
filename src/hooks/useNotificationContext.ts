import { useMemo } from 'react';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';

import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useEncryptedSettings } from '@/hooks/useEncryptedSettings';
import { getEffectiveRelays } from '@/lib/appRelays';
import { GIT_DISCOVERY_RELAYS, GIT_REPO_KIND, isValidRepoAnnouncement, parseRepoAnnouncement } from '@/lib/git';
import { CUSTOM_NIP_KIND } from '@/lib/nips';
import {
  GIT_TICKET_KINDS,
  OWNED_CONTENT_KINDS,
  officialNipContent,
  toOwnedContent,
  toWatchedTicket,
  type NotificationContext,
  type OwnedContent,
  type WatchedRepo,
  type WatchedTicket,
} from '@/lib/notifications';
import { queryRelays } from '@/lib/queryRelays';
import { normalizeRelayUrls } from '@/lib/relayUrls';

/**
 * Most threads watched at once: relays (and napp hosts) cap a filter's list
 * at 500 entries. The most recently active are kept.
 */
const MAX_WATCHED_TICKETS = 500;
/** Most relays asked for git activity. napp hosts take ten per subscription. */
const MAX_GIT_RELAYS = 10;

/**
 * Everything that decides what's news to the logged-in user — see
 * {@link NotificationContext}. Shared by the bell and push, so both agree.
 *
 * Built in two rounds. The first finds what the user made: their addressable
 * content and repos, the issues/PRs/patches they opened, and the git threads
 * they've commented on, plus the NIPs they follow. The second finds the
 * threads on their repos and resolves the ones they commented on, which
 * together are the threads they're watching (GitHub's "participating" and
 * "watching" — a maintainer watches their own repos).
 */
export function useNotificationContext() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { settings } = useEncryptedSettings();
  const { config } = useAppContext();
  const pubkey = user?.pubkey;

  const readRelays = useMemo(
    () => normalizeRelayUrls(
      getEffectiveRelays(config.relayMetadata, config.useAppRelays, config.useUserRelays).relays
        .filter((r) => r.read)
        .map((r) => r.url),
    ),
    [config.relayMetadata, config.useAppRelays, config.useUserRelays],
  );

  const followedNips = settings?.followedNips;
  const followedKey = (followedNips ?? []).map((f) => `${f.target}@${f.since}`).sort().join(',');

  return useQuery<NotificationContext>({
    queryKey: ['notification-context', pubkey, followedKey, readRelays.join(',')],
    queryFn: async ({ signal }) => {
      if (!pubkey) throw new Error('Not logged in');
      const opts = { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) };

      const followedSince = new Map((followedNips ?? []).map((f) => [f.target, f.since] as const));
      const followedCustom = [...followedSince.keys()].filter((t) => t.startsWith(`${CUSTOM_NIP_KIND}:`));
      const gitGroup = nostr.group(normalizeRelayUrls([...GIT_DISCOVERY_RELAYS, ...readRelays]).slice(0, MAX_GIT_RELAYS));

      // --- Round 1: what the user made, and what they follow ---

      const followedFilters: NostrFilter[] = followedCustom.flatMap((coord) => {
        const [, author, ...d] = coord.split(':');
        return author && d.length
          ? [{ kinds: [CUSTOM_NIP_KIND], authors: [author], '#d': [d.join(':')], limit: 1 }]
          : [];
      });
      const [contentEvents, gitEvents] = await Promise.all([
        nostr.query(
          [{ kinds: [...OWNED_CONTENT_KINDS], authors: [pubkey], limit: 300 }, ...followedFilters],
          opts,
        ).catch(() => [] as NostrEvent[]),
        queryRelays(gitGroup, [
          { kinds: [GIT_REPO_KIND], authors: [pubkey], limit: 100 },
          { kinds: [...GIT_TICKET_KINDS], authors: [pubkey], limit: 300 },
          { kinds: [1111], authors: [pubkey], '#K': GIT_TICKET_KINDS.map(String), limit: 500 },
        ], opts),
      ]);

      const owned = new Map<string, OwnedContent>();
      const repos = new Map<string, WatchedRepo>();
      const followed: NotificationContext['followed'] = new Map();
      const repoRelays: string[] = [];

      for (const event of [...contentEvents, ...gitEvents]) {
        if (event.kind === GIT_REPO_KIND && event.pubkey === pubkey) {
          if (!isValidRepoAnnouncement(event)) continue;
          const content = toOwnedContent(event);
          if (!content) continue;
          const repo = parseRepoAnnouncement(event);
          const maintainers = [pubkey, ...repo.maintainers];
          const watched: WatchedRepo = { ...content, title: repo.name, maintainers };
          owned.set(content.coordinate, watched);
          for (const maintainer of maintainers) {
            repos.set(`${GIT_REPO_KIND}:${maintainer}:${repo.identifier}`, watched);
          }
          repoRelays.push(...repo.relays);
          continue;
        }
        if (!(OWNED_CONTENT_KINDS as readonly number[]).includes(event.kind)) continue;
        const content = toOwnedContent(event);
        if (!content) continue;
        if (event.pubkey === pubkey) {
          const existing = owned.get(content.coordinate);
          if (!existing) owned.set(content.coordinate, content);
        } else if (followedSince.has(content.coordinate)) {
          followed.set(content.coordinate, { since: followedSince.get(content.coordinate)!, content });
        }
      }
      for (const [target, since] of followedSince) {
        if (followed.has(target)) continue;
        followed.set(target, { since, content: officialNipContent(target) ?? undefined });
      }

      // Threads the user opened, and the last time they were active in each.
      const tickets = new Map<string, WatchedTicket>();
      const lastActive = new Map<string, number>();
      const commentedOn = new Set<string>();
      const touch = (id: string, at: number) => lastActive.set(id, Math.max(lastActive.get(id) ?? 0, at));
      for (const event of gitEvents) {
        if (event.pubkey !== pubkey) continue;
        if (event.kind === 1111) {
          const root = event.tags.find(([n]) => n === 'E')?.[1];
          if (root) {
            commentedOn.add(root);
            touch(root, event.created_at);
          }
          continue;
        }
        const ticket = toWatchedTicket(event);
        if (!ticket) continue;
        tickets.set(ticket.coordinate, ticket);
        touch(ticket.coordinate, event.created_at);
      }

      // --- Round 2: threads on the user's repos, and the ones they commented on ---

      const gitRelays = normalizeRelayUrls([...GIT_DISCOVERY_RELAYS, ...repoRelays, ...readRelays]).slice(0, MAX_GIT_RELAYS);
      const repoCoords = [...repos.keys()];
      const unresolved = [...commentedOn].filter((id) => !tickets.has(id));
      const round2: NostrFilter[] = [];
      if (repoCoords.length) round2.push({ kinds: [...GIT_TICKET_KINDS], '#a': repoCoords, limit: MAX_WATCHED_TICKETS });
      if (unresolved.length) round2.push({ ids: unresolved.slice(0, MAX_WATCHED_TICKETS), kinds: [...GIT_TICKET_KINDS] });
      if (round2.length) {
        const events = await queryRelays(nostr.group(gitRelays), round2, opts);
        for (const event of events) {
          const ticket = toWatchedTicket(event);
          if (!ticket || tickets.has(ticket.coordinate)) continue;
          tickets.set(ticket.coordinate, ticket);
          touch(ticket.coordinate, event.created_at);
        }
      }

      // Keep the most recently active, within what one filter can carry.
      const watched = new Map(
        [...tickets]
          .sort(([a], [b]) => (lastActive.get(b) ?? 0) - (lastActive.get(a) ?? 0))
          .slice(0, MAX_WATCHED_TICKETS),
      );

      return { pubkey, owned, repos, tickets: watched, followed, readRelays, gitRelays };
    },
    enabled: !!pubkey,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}
