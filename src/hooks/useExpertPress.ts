import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { nip19 } from 'nostr-tools';
import type { NostrEvent } from '@nostrify/nostrify';
import { useExperts } from '@/hooks/useExperts';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import { SEARCH_RELAYS } from '@/lib/searchRelays';
import { useAppContext } from '@/hooks/useAppContext';

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

/**
 * Minimum markdown body length for the feature well — just enough to drop
 * "test"/placeholder kind 30023 events without excluding legit short pieces.
 * Measured against the *prose* body, after stripping references (see
 * {@link proseLength}), so link-roll aggregator posts don't qualify.
 */
const MIN_ARTICLE_CHARS = 200;

/**
 * Length of the human-readable prose in a markdown body, ignoring boilerplate
 * that carries no editorial weight: `nostr:` mentions, bare URLs, markdown
 * link/image targets, and whitespace. Aggregator/link-roll posts (e.g. the
 * `matometr` client, which dumps a stack of `nostr:nevent1…` references with
 * no commentary) collapse to ~0 here and are dropped from the feature well.
 */
function proseLength(content: string): number {
  return content
    // markdown images / links: keep the visible label, drop the target.
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    // nostr: mentions (npub/note/nevent/naddr/nprofile + raw entity strings).
    .replace(/(?:nostr:)?(?:npub|note|nevent|naddr|nprofile|nsec)1[0-9a-z]+/gi, '')
    // bare URLs.
    .replace(/https?:\/\/\S+/gi, '')
    // collapse remaining whitespace.
    .replace(/\s+/g, ' ')
    .trim().length;
}

function parseArticle(event: NostrEvent): ExpertArticle | null {
  const identifier = tag(event, 'd');
  const title = tag(event, 'title')?.trim();
  const content = event.content.trim();
  if (identifier === undefined || !title || proseLength(content) < MIN_ARTICLE_CHARS) {
    return null;
  }

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

const NOTE_WINDOW_DAYS = 2;

/** Dedupe raw 30023 events to the latest per (author, d) and parse, newest-first. */
function collectArticles(events: NostrEvent[]): ExpertArticle[] {
  const latestArticles = new Map<string, NostrEvent>();
  for (const ev of events) {
    if (ev.kind !== ARTICLE_KIND) continue;
    const d = ev.tags.find(([n]) => n === 'd')?.[1] ?? '';
    const key = `${ev.pubkey}:${d}`;
    const prev = latestArticles.get(key);
    if (!prev || ev.created_at > prev.created_at) latestArticles.set(key, ev);
  }
  return Array.from(latestArticles.values())
    .map(parseArticle)
    .filter((a): a is ExpertArticle => a !== null)
    .sort((a, b) => b.publishedAt - a.publishedAt);
}

/**
 * Collapse a newest-first article list to a single entry per author — each
 * expert's most recent piece — preserving the input ordering.
 */
function latestPerAuthor(articles: ExpertArticle[]): ExpertArticle[] {
  const seen = new Set<string>();
  const out: ExpertArticle[] = [];
  for (const article of articles) {
    if (seen.has(article.author)) continue;
    seen.add(article.author);
    out.push(article);
  }
  return out;
}

/**
 * Recent long-form articles (kind 30023) from the panel of experts, deduped to
 * the latest revision per address and ordered newest-first by publish date.
 * Scoped to expert authors. The `/articles` directory uses this only to pick a
 * handful of lead features, so the fetch is kept small — the broader feed comes
 * from {@link useCommunityArticles}.
 */
export function useExpertArticles() {
  const { nostr } = useNostr();
  const { experts } = useExperts();

  return useQuery<ExpertArticle[]>({
    queryKey: ['expert-articles', [...experts].sort()],
    queryFn: async ({ signal }) => {
      const opts = { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) };
      // Only a few leads are shown; a small buffer survives dedupe-to-latest.
      const events = await nostr.query(
        [{ kinds: [ARTICLE_KIND], authors: experts, limit: 24 }],
        opts,
      );
      return collectArticles(events);
    },
    enabled: experts.length > 0,
    staleTime: 60 * 1000,
  });
}

/**
 * Long-form articles (kind 30023) from a broader author set — typically the
 * whole community web-of-trust (see {@link useCommunityAuthors}). Deduped to
 * the latest revision per address and ordered newest-first by publish date.
 * Used to backfill the `/articles` directory beyond the experts' own pieces.
 */
export function useCommunityArticles(authors: string[] | undefined) {
  const { nostr } = useNostr();
  const list = authors ?? [];

  return useQuery<ExpertArticle[]>({
    queryKey: ['community-articles', [...list].sort()],
    queryFn: async ({ signal }) => {
      const opts = { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) };
      const events = await nostr.query(
        [{ kinds: [ARTICLE_KIND], authors: list, limit: 100 }],
        opts,
      );
      return collectArticles(events);
    },
    enabled: list.length > 0,
    staleTime: 60 * 1000,
  });
}

/**
 * The experts' own publishing output. Long-form articles (kind 30023) come
 * from the app's relay pool via a normal REQ — no NIP-50 — and are simply
 * ordered newest-first by publish date. Top-level notes (kind 1) for the
 * pull quotes still go to the search relays with `sort:hot`, preserving the
 * relay's engagement ranking.
 */
export function useExpertPress() {
  const { nostr } = useNostr();
  const { experts } = useExperts();
  const { config } = useAppContext();
  const searchRelays = config.searchRelays.length > 0 ? config.searchRelays : SEARCH_RELAYS;

  return useQuery<ExpertPress>({
    queryKey: ['expert-press', [...experts].sort(), searchRelays],
    queryFn: async ({ signal }) => {
      const noteSince = Math.floor(Date.now() / 1000) - NOTE_WINDOW_DAYS * 86400;
      const opts = { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) };

      const [articleEvents, noteEvents] = await Promise.all([
        // Overfetch a touch so each expert is represented even when a few
        // prolific authors would otherwise dominate the newest-first window.
        nostr.query([{ kinds: [ARTICLE_KIND], authors: experts, limit: 100 }], opts),
        nostr
          .group(searchRelays)
          // `-tag:e` excludes replies relay-side (Ditto NIP-50 extension), so the
          // small limit is spent on top-level posts rather than replies we'd drop.
          // The client-side `e`-tag guard below still covers relays that ignore it.
          .query([{ kinds: [1], authors: experts, search: 'sort:hot -tag:e', since: noteSince, limit: 12 }], opts),
      ]);

      // Articles: keep only the latest event per (author, d) address,
      // newest-first by publish date, then collapse to a single feature per
      // expert — their most recent piece — so no one author floods the well.
      const articles = latestPerAuthor(collectArticles(articleEvents));

      // Notes: top-level posts only (no `e` tags), in hot order.
      const seen = new Set<string>();
      const notes: ExpertNote[] = [];
      for (const ev of noteEvents) {
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
