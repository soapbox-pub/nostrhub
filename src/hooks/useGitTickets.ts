import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';
import { useAppContext } from '@/hooks/useAppContext';
import { getEffectiveRelays } from '@/lib/appRelays';
import {
  GIT_DISCOVERY_RELAYS,
  GIT_ISSUE_KIND,
  GIT_PR_KIND,
  GIT_REPO_KIND,
  GIT_STATUS_KINDS,
  parseGitTicket,
  statusFromKind,
  type GitItemStatus,
  type GitTicket,
} from '@/lib/git';

export interface GitTicketWithStatus extends GitTicket {
  /** Resolved lifecycle status from the most recent valid status event. */
  status: GitItemStatus;
}

export interface GitTicketsData {
  issues: GitTicketWithStatus[];
  pullRequests: GitTicketWithStatus[];
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
 * Fetch NIP-34 issues (kind 1621) and pull requests (kind 1618) for a
 * repository, along with their status events (kinds 1630–1633), and resolve
 * each ticket's lifecycle state.
 *
 * Issues and PRs are public, anyone-can-send events, so they are NOT
 * author-filtered. Status, however, is only honored from the ticket author or
 * a repository maintainer (per NIP-34) to prevent third parties from spoofing a
 * "closed"/"merged" state.
 */
export function useGitTickets({
  pubkey,
  identifier,
  maintainers = [],
  relays = [],
}: {
  pubkey: string;
  identifier: string;
  /** Recognized maintainers (beyond the owner) whose status events are trusted. */
  maintainers?: string[];
  /** Relay hints (e.g. the repo's announced relays). */
  relays?: string[];
}) {
  const { nostr } = useNostr();
  const { config } = useAppContext();

  return useQuery<GitTicketsData>({
    queryKey: ['git-tickets', pubkey, identifier, [...relays].sort().join(',')],
    queryFn: async ({ signal }) => {
      const readRelays = getEffectiveRelays(
        config.relayMetadata,
        config.useAppRelays,
        config.useUserRelays,
      ).relays
        .filter((r) => r.read)
        .map((r) => r.url);

      const dedupe = (input: string[]): string[] => {
        const out = new Set<string>();
        for (const url of input) {
          const normalized = normalizeRelayUrl(url);
          if (normalized) out.add(normalized);
        }
        return [...out];
      };

      const urls = dedupe([...relays, ...readRelays, ...GIT_DISCOVERY_RELAYS]).slice(0, 12);

      const address = `${GIT_REPO_KIND}:${pubkey}:${identifier}`;
      const tickets: NostrEvent[] = [];
      const statuses: NostrEvent[] = [];

      const reqSignal = AbortSignal.any([signal, AbortSignal.timeout(8000)]);
      try {
        for await (const msg of nostr.group(urls).req(
          [
            { kinds: [GIT_ISSUE_KIND, GIT_PR_KIND], '#a': [address], limit: 200 },
            { kinds: [...GIT_STATUS_KINDS], '#a': [address], limit: 500 },
          ],
          { signal: reqSignal, eoseTimeout: 4000 },
        )) {
          if (msg[0] === 'EOSE' || msg[0] === 'CLOSED') break;
          if (msg[0] !== 'EVENT') continue;
          const ev = msg[2];
          if (ev.kind === GIT_ISSUE_KIND || ev.kind === GIT_PR_KIND) tickets.push(ev);
          else statuses.push(ev);
        }
      } catch {
        // Aborted or relay error — use whatever was collected.
      }

      // Trust set for status events: ticket authors + repo owner + maintainers.
      const ticketAuthors = new Set(tickets.map((t) => t.pubkey));
      const maintainerSet = new Set([pubkey, ...maintainers]);

      // Latest trusted status event per ticket id.
      const latestStatus = new Map<string, NostrEvent>();
      for (const status of statuses) {
        const rootId = status.tags.find(
          ([n, , , marker]) => n === 'e' && (marker === 'root' || marker === undefined),
        )?.[1];
        if (!rootId) continue;
        // Honor status only from the ticket's author or a maintainer.
        const trusted =
          maintainerSet.has(status.pubkey) || ticketAuthors.has(status.pubkey);
        if (!trusted) continue;
        const existing = latestStatus.get(rootId);
        if (!existing || status.created_at > existing.created_at) {
          latestStatus.set(rootId, status);
        }
      }

      const dedupeById = (events: NostrEvent[]) => {
        const seen = new Map<string, NostrEvent>();
        for (const ev of events) if (!seen.has(ev.id)) seen.set(ev.id, ev);
        return [...seen.values()];
      };

      const toWithStatus = (event: NostrEvent): GitTicketWithStatus | null => {
        const parsed = parseGitTicket(event);
        if (!parsed) return null;
        const statusKind = latestStatus.get(event.id)?.kind;
        return { ...parsed, status: statusFromKind(statusKind, event.kind) };
      };

      const all = dedupeById(tickets)
        .map(toWithStatus)
        .filter((t): t is GitTicketWithStatus => t !== null)
        .sort((a, b) => b.createdAt - a.createdAt);

      return {
        issues: all.filter((t) => t.kind === GIT_ISSUE_KIND),
        pullRequests: all.filter((t) => t.kind === GIT_PR_KIND),
      };
    },
    enabled: Boolean(pubkey && identifier),
    staleTime: 30 * 1000,
    retry: 1,
  });
}
