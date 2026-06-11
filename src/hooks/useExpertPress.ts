import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { nip19 } from 'nostr-tools';
import type { NostrEvent } from '@nostrify/nostrify';
import { useExperts } from '@/hooks/useExperts';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import { SEARCH_RELAYS } from '@/lib/searchRelays';

/** NIP-23 long-form article kind. */
export const ARTICLE_KIND = 30023;

export interface ExpertArticle {
  event: NostrEvent;
  identifier: string;
  title: string;
  summary?: string;
  /** Sanitized https cover image, if the article has one. */
  image?: string;
  /** `published_at` tag when present, else `created_at` (seconds). */
  publishedAt: number;
  author: string;
  naddr: string;
}

export interface ExpertNote {
  event: NostrEvent;
  nevent: string;
}

export interface ExpertPress {
  articles: ExpertArticle[];
  notes: ExpertNote[];
}

const tag = (event: NostrEvent, name: string): string | undefined =>
  event.tags.find(([n]) => n === name)?.[1];

function parseArticle(event: NostrEvent): ExpertArticle | null {
  const identifier = tag(event, 'd');
  const title = tag(event, 'title')?.trim();
  if (identifier === undefined || !title || !event.content.trim()) return null;

  const publishedAtRaw = Number(tag(event, 'published_at'));
  const publishedAt =
    Number.isFinite(publishedAtRaw) && publishedAtRaw > 0 ? publishedAtRaw : event.created_at;

  return {
    event,
    identifier,
    title,
    summary: tag(event, 'summary')?.trim() || undefined,
    image: sanitizeUrl(tag(event, 'image')),
    publishedAt,
    author: event.pubkey,
    naddr: nip19.naddrEncode({ kind: ARTICLE_KIND, pubkey: event.pubkey, identifier }),
  };
}

/** Recency windows: this is a magazine, not an archive. */
const ARTICLE_WINDOW_DAYS = 90;
const NOTE_WINDOW_DAYS = 30;

/**
 * The experts' own publishing output, hot-ranked: long-form articles
 * (kind 30023) for the feature well and top-level notes (kind 1) for pull
 * quotes. Queries go to the NIP-50 search relays with `sort:hot` so the
 * relay's engagement ranking decides what leads, and the returned order is
 * preserved rather than re-sorted by time. Both queries are windowed so
 * `sort:hot` can't resurface years-old evergreens.
 */
export function useExpertPress() {
  const { nostr } = useNostr();
  const { experts } = useExperts();

  return useQuery<ExpertPress>({
    queryKey: ['expert-press', [...experts].sort()],
    queryFn: async ({ signal }) => {
      const nowSec = Math.floor(Date.now() / 1000);
      const articleSince = nowSec - ARTICLE_WINDOW_DAYS * 86400;
      const noteSince = nowSec - NOTE_WINDOW_DAYS * 86400;

      const group = nostr.group(SEARCH_RELAYS);
      const events = await group.query(
        [
          { kinds: [ARTICLE_KIND], authors: experts, search: 'sort:hot', since: articleSince, limit: 24 },
          { kinds: [1], authors: experts, search: 'sort:hot', since: noteSince, limit: 48 },
        ],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) },
      );

      // Articles: keep only the latest event per (author, d) address, in the
      // relay's hot order (first appearance wins the rank slot).
      const addressOrder: string[] = [];
      const latestArticles = new Map<string, NostrEvent>();
      for (const ev of events) {
        if (ev.kind !== ARTICLE_KIND) continue;
        const d = ev.tags.find(([n]) => n === 'd')?.[1] ?? '';
        const key = `${ev.pubkey}:${d}`;
        const prev = latestArticles.get(key);
        if (!prev) addressOrder.push(key);
        if (!prev || ev.created_at > prev.created_at) latestArticles.set(key, ev);
      }
      const articles = addressOrder
        .map((key) => parseArticle(latestArticles.get(key)!))
        .filter((a): a is ExpertArticle => a !== null)
        // `since` only constrains `created_at`; a recently-edited old article
        // still carries its original `published_at`. Enforce the window on
        // the date readers actually see.
        .filter((a) => a.publishedAt >= articleSince);

      // Notes: top-level posts only (no `e` tags), in hot order.
      const seen = new Set<string>();
      const notes: ExpertNote[] = [];
      for (const ev of events) {
        if (ev.kind !== 1 || seen.has(ev.id)) continue;
        seen.add(ev.id);
        if (ev.created_at < noteSince) continue;
        if (ev.tags.some(([n]) => n === 'e')) continue;
        if (!ev.content.trim()) continue;
        notes.push({ event: ev, nevent: nip19.neventEncode({ id: ev.id, author: ev.pubkey }) });
      }

      return { articles, notes };
    },
    enabled: experts.length > 0,
    staleTime: 60 * 1000,
  });
}
