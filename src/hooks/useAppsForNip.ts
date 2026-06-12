import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';
import { APP_HANDLER_KIND, dedupeAppEvents, nipGithubUrl, type AppInfo } from '@/lib/apps';

/**
 * Find NIP-89 app listings (kind 31990) that explicitly reference a custom NIP
 * (kind 30817) via an `a` tag:
 *   `["a", "30817:<pubkey>:<d>", "<relay>"]`
 *
 * We query `#a` (relay-indexed single-letter tag) and client-filter to the
 * exact address so we don't match unrelated `a` tags on the same event.
 */
export function useAppsForCustomNip(nipAddress: string | undefined) {
  const { nostr } = useNostr();

  return useQuery<AppInfo[]>({
    queryKey: ['apps-for-nip', 'custom', nipAddress],
    queryFn: async ({ signal }) => {
      const events = await nostr
        .query(
          [{ kinds: [APP_HANDLER_KIND], '#a': [nipAddress!], limit: 50 }],
          { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) },
        )
        .catch(() => [] as NostrEvent[]);

      // Only keep events that actually carry an `a` tag pointing at this address.
      // (The kind prefix "30817:" in the address is itself unambiguous, but we
      //  double-check to avoid false matches from other addressable-event tags.)
      const filtered = events.filter((ev) =>
        ev.tags.some(([n, v]) => n === 'a' && v === nipAddress),
      );

      return dedupeAppEvents(filtered);
    },
    enabled: Boolean(nipAddress),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Find NIP-89 app listings (kind 31990) that announce support for a specific
 * event kind via a `k` tag: `["k", "20"]`.
 */
export function useAppsForKind(kind: string | undefined) {
  const { nostr } = useNostr();

  return useQuery<AppInfo[]>({
    queryKey: ['apps-for-kind', kind],
    queryFn: async ({ signal }) => {
      const events = await nostr
        .query(
          [{ kinds: [APP_HANDLER_KIND], '#k': [kind!], limit: 100 }],
          { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) },
        )
        .catch(() => [] as NostrEvent[]);

      // Confirm the `k` tag value matches exactly.
      const filtered = events.filter((ev) =>
        ev.tags.some(([n, v]) => n === 'k' && v === kind),
      );

      return dedupeAppEvents(filtered);
    },
    enabled: Boolean(kind),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Find NIP-89 app listings (kind 31990) that reference an official NIP via a
 * NIP-73 URL `i` tag pointing at the canonical GitHub blob URL:
 *   `["i", "https://github.com/nostr-protocol/nips/blob/master/01.md"]`
 *
 * This is the same URL format used by NIP approvals (kind 1985) and NIP forks
 * (kind 30817) everywhere else in this codebase.
 */
export function useAppsForOfficialNip(nipNumber: string | undefined) {
  const { nostr } = useNostr();
  const url = nipNumber ? nipGithubUrl(nipNumber) : undefined;

  return useQuery<AppInfo[]>({
    queryKey: ['apps-for-nip', 'official', nipNumber],
    queryFn: async ({ signal }) => {
      const events = await nostr
        .query(
          [{ kinds: [APP_HANDLER_KIND], '#i': [url!], limit: 50 }],
          { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) },
        )
        .catch(() => [] as NostrEvent[]);

      // Confirm the `i` tag value matches exactly.
      const filtered = events.filter((ev) =>
        ev.tags.some(([n, v]) => n === 'i' && v === url),
      );

      return dedupeAppEvents(filtered);
    },
    enabled: Boolean(url),
    staleTime: 5 * 60 * 1000,
  });
}
