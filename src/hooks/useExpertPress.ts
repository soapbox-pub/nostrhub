import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { nip19 } from 'nostr-tools';
import type { NostrEvent } from '@nostrify/nostrify';
import { useExperts } from '@/hooks/useExperts';
import { sanitizeUrl } from '@/lib/sanitizeUrl';

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

/**
 * The experts' own publishing output, fetched in a single round-trip:
 * long-form articles (kind 30023) for the feature well, and top-level notes
 * (kind 1) for pull quotes and the live ticker.
 */
export function useExpertPress() {
  const { nostr } = useNostr();
  const { experts } = useExperts();

  return useQuery<ExpertPress>({
    queryKey: ['expert-press', [...experts].sort()],
    queryFn: async ({ signal }) => {
      const events = await nostr.query(
        [
          { kinds: [ARTICLE_KIND], authors: experts, limit: 24 },
          { kinds: [1], authors: experts, limit: 48 },
        ],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) },
      );

      // Articles: keep only the latest event per (author, d) address.
      const latestArticles = new Map<string, NostrEvent>();
      for (const ev of events) {
        if (ev.kind !== ARTICLE_KIND) continue;
        const d = ev.tags.find(([n]) => n === 'd')?.[1] ?? '';
        const key = `${ev.pubkey}:${d}`;
        const prev = latestArticles.get(key);
        if (!prev || ev.created_at > prev.created_at) latestArticles.set(key, ev);
      }
      const articles = Array.from(latestArticles.values())
        .map(parseArticle)
        .filter((a): a is ExpertArticle => a !== null)
        .sort((a, b) => b.publishedAt - a.publishedAt);

      // Notes: top-level posts only (no `e` tags), newest first.
      const seen = new Set<string>();
      const notes: ExpertNote[] = [];
      for (const ev of events.sort((a, b) => b.created_at - a.created_at)) {
        if (ev.kind !== 1 || seen.has(ev.id)) continue;
        seen.add(ev.id);
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
