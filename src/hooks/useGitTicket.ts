import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';
import { useAppContext } from '@/hooks/useAppContext';
import { getEffectiveRelays } from '@/lib/appRelays';
import {
  GIT_DISCOVERY_RELAYS,
  GIT_ISSUE_KIND,
  GIT_PATCH_KIND,
  GIT_PR_KIND,
  GIT_REPO_KIND,
  GIT_STATUS_KINDS,
  parseGitTicket,
  parseRepoAnnouncement,
  statusFromKind,
  type GitItemStatus,
  type GitTicket,
} from '@/lib/git';

export interface SingleGitTicket extends GitTicket {
  status: GitItemStatus;
  /** Repo announcement address (`30617:pubkey:d`) from the ticket's `a` tag. */
  repoAddress?: string;
  /** Branch name suggested by the PR (`branch-name` tag), if any. */
  branchName?: string;
}

function normalizeRelayUrl(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'wss:' && parsed.protocol !== 'ws:') return undefined;
    return parsed.href;
  } catch {
    return undefined;
  }
}

/**
 * Fetch a single NIP-34 issue (1621), patch (1617), or merge request (1618) by
 * event id, along with its status events, and resolve its lifecycle state.
 *
 * Status is honored only from the ticket's author or a recognized maintainer
 * (the repo owner is passed via `maintainers`), preventing status spoofing.
 */
export function useGitTicket(
  eventId: string,
  { maintainers = [] }: { maintainers?: string[] } = {},
) {
  const { nostr } = useNostr();
  const { config } = useAppContext();

  return useQuery<SingleGitTicket | null>({
    queryKey: ['git-ticket', eventId, [...maintainers].sort().join(',')],
    queryFn: async ({ signal }) => {
      const readRelays = getEffectiveRelays(
        config.relayMetadata,
        config.useAppRelays,
        config.useUserRelays,
      ).relays
        .filter((r) => r.read)
        .map((r) => r.url);

      const urls = new Set<string>();
      for (const url of [...readRelays, ...GIT_DISCOVERY_RELAYS]) {
        const normalized = normalizeRelayUrl(url);
        if (normalized) urls.add(normalized);
      }

      const reqSignal = AbortSignal.any([signal, AbortSignal.timeout(8000)]);
      let ticketEvent: NostrEvent | undefined;
      const statuses: NostrEvent[] = [];

      try {
        for await (const msg of nostr.group([...urls].slice(0, 12)).req(
          [
            { ids: [eventId], kinds: [GIT_ISSUE_KIND, GIT_PR_KIND, GIT_PATCH_KIND] },
            { kinds: [...GIT_STATUS_KINDS], '#e': [eventId], limit: 100 },
          ],
          { signal: reqSignal, eoseTimeout: 4000 },
        )) {
          if (msg[0] === 'EOSE' || msg[0] === 'CLOSED') break;
          if (msg[0] !== 'EVENT') continue;
          const ev = msg[2];
          if (ev.id === eventId) ticketEvent = ev;
          else statuses.push(ev);
        }
      } catch {
        // Aborted or relay error — use whatever was collected.
      }

      if (!ticketEvent) return null;
      const parsed = parseGitTicket(ticketEvent);
      if (!parsed) return null;

      const repoAddress = ticketEvent.tags.find(([n]) => n === 'a')?.[1];
      const ownerPubkey = repoAddress?.split(':')[1];

      // Resolve recognized maintainers from the repo announcement so their
      // status events are honored too (callers rarely have them up front).
      // Streamed via `.req()` — the pool's 200ms `eoseTimeout` would let a
      // fast empty relay abort `.query()` before the git relays answer.
      let repoMaintainers: string[] = [];
      const [addrKind, addrOwner, ...addrDParts] = (repoAddress ?? '').split(':');
      if (addrKind === String(GIT_REPO_KIND) && addrOwner) {
        let repoEvent: NostrEvent | undefined;
        try {
          for await (const msg of nostr.group([...urls].slice(0, 12)).req(
            [
              {
                kinds: [GIT_REPO_KIND],
                authors: [addrOwner],
                '#d': [addrDParts.join(':')],
                limit: 1,
              },
            ],
            {
              signal: AbortSignal.any([signal, AbortSignal.timeout(4000)]),
              eoseTimeout: 2000,
            },
          )) {
            if (msg[0] === 'EOSE' || msg[0] === 'CLOSED') break;
            if (msg[0] !== 'EVENT') continue;
            // Addressable: keep the newest version across relays.
            if (!repoEvent || msg[2].created_at > repoEvent.created_at) repoEvent = msg[2];
          }
        } catch {
          // Repo announcement unavailable — owner + author trust still applies.
        }
        if (repoEvent) repoMaintainers = parseRepoAnnouncement(repoEvent).maintainers;
      }

      const trustSet = new Set(
        [ownerPubkey, parsed.pubkey, ...maintainers, ...repoMaintainers].filter(
          (p): p is string => Boolean(p),
        ),
      );

      // Most-recent trusted status event for this ticket. A status only
      // applies when it references this ticket as its *root* (`e` tag with a
      // "root" marker, or unmarked) — status events also carry "mention"/
      // "reply" `e` tags pointing at related tickets (e.g. ngit closes
      // superseded PRs with events that merely mention the replacement), and
      // those must not flip this ticket's state.
      let latest: NostrEvent | undefined;
      for (const status of statuses) {
        if (!trustSet.has(status.pubkey)) continue;
        const refsAsRoot = status.tags.some(
          ([n, v, , marker]) =>
            n === 'e' && v === eventId && (marker === 'root' || marker === undefined || marker === ''),
        );
        if (!refsAsRoot) continue;
        if (!latest || status.created_at > latest.created_at) latest = status;
      }

      return {
        ...parsed,
        status: statusFromKind(latest?.kind, parsed.kind),
        repoAddress,
        branchName: ticketEvent.tags.find(([n]) => n === 'branch-name')?.[1],
      };
    },
    enabled: Boolean(eventId),
    staleTime: 30 * 1000,
    retry: 1,
  });
}
