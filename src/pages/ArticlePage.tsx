import { useNostr } from '@nostrify/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSeoMeta } from '@unhead/react';
import { Link } from 'react-router-dom';
import { nip19 } from 'nostr-tools';
import type { NostrEvent } from '@nostrify/nostrify';
import { Layout } from '@/components/Layout';
import { DetailSurface } from '@/components/DetailSurface';
import { HighlightableMarkdown } from '@/components/HighlightableMarkdown';
import { CommentsSection } from '@/components/comments/CommentsSection';
import { articleHighlightSource } from '@/lib/highlightSource';
import { UserAvatar } from '@/components/UserAvatar';
import { useAuthor } from '@/hooks/useAuthor';
import { ARTICLE_KIND } from '@/hooks/useExpertPress';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import { shortNpub } from '@/lib/nostr';
import { SEARCH_RELAYS } from '@/lib/searchRelays';
import { useAppContext } from '@/hooks/useAppContext';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';

interface ArticlePageProps {
  pubkey: string;
  identifier: string;
}

const tag = (event: NostrEvent, name: string): string | undefined =>
  event.tags.find(([n]) => n === name)?.[1];

/** Long-form article page (NIP-23, kind 30023), addressed by naddr. */
export function ArticlePage({ pubkey, identifier }: ArticlePageProps) {
  const { nostr } = useNostr();
  const { config } = useAppContext();
  const searchRelays = config.searchRelays.length > 0 ? config.searchRelays : SEARCH_RELAYS;
  const queryClient = useQueryClient();
  const author = useAuthor(pubkey);
  const metadata = author.data?.metadata;

  const { data: event, isLoading } = useQuery<NostrEvent | null>({
    queryKey: ['article', pubkey, identifier],
    queryFn: async ({ signal, queryKey }) => {
      const filter = { kinds: [ARTICLE_KIND], authors: [pubkey], '#d': [identifier], limit: 1 };
      const opts = { signal: AbortSignal.any([signal, AbortSignal.timeout(6000)]) };

      // Try the app pool first; fall back to the search relays, where
      // articles surfaced through NIP-50 discovery are guaranteed to live.
      const fromPool = await nostr.query([filter], opts);
      const events = fromPool.length > 0 ? fromPool : await nostr.group(searchRelays).query([filter], opts);

      const fetched = events.sort((a, b) => b.created_at - a.created_at)[0] ?? null;
      // A freshly-published article may not be indexed yet; keep any
      // optimistically-seeded event rather than overwriting it with null.
      if (!fetched) {
        return queryClient.getQueryData<NostrEvent | null>(queryKey) ?? null;
      }
      return fetched;
    },
    staleTime: 60 * 1000,
  });

  const title = event ? tag(event, 'title') : undefined;
  const summary = event ? tag(event, 'summary') : undefined;
  const image = event ? sanitizeUrl(tag(event, 'image')) : undefined;
  const publishedAtRaw = event ? Number(tag(event, 'published_at')) : NaN;
  const publishedAt = event
    ? new Date((Number.isFinite(publishedAtRaw) && publishedAtRaw > 0 ? publishedAtRaw : event.created_at) * 1000)
    : undefined;

  const authorName = metadata?.display_name || metadata?.name || shortNpub(pubkey);
  const npub = nip19.npubEncode(pubkey);

  useSeoMeta({
    title: title ? `${title} — NostrHub` : 'Article — NostrHub',
    description: summary ?? 'A long-form article on NostrHub.',
  });

  if (isLoading) {
    return (
      <Layout className="max-w-3xl">
        <div className="space-y-6">
          <Skeleton className="aspect-[21/9] w-full rounded-2xl" />
          <DetailSurface className="space-y-6">
            <Skeleton className="h-10 w-3/4" />
            <Skeleton className="h-4 w-40" />
            <div className="space-y-3">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          </DetailSurface>
        </div>
      </Layout>
    );
  }

  if (!event) {
    return (
      <Layout className="max-w-3xl">
        <Card className="border-dashed">
          <CardContent className="px-8 py-12 text-center">
            <p className="mx-auto max-w-sm text-muted-foreground">
              Article not found. It may not have propagated to your relays yet.
            </p>
          </CardContent>
        </Card>
      </Layout>
    );
  }

  return (
    <Layout className="max-w-3xl">
      <article className="space-y-6">
        {image && (
          <img
            src={image}
            alt=""
            className="aspect-[21/9] w-full rounded-2xl border border-border/60 object-cover"
          />
        )}

        <DetailSurface className="space-y-6">
          <header className="space-y-4">
          <span className="text-[11px] font-bold uppercase tracking-[0.3em] text-nebula">
            Feature
          </span>
          <h1 className="font-display text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl">
            {title ?? 'Untitled'}
          </h1>
          {summary && (
            <p className="text-lg leading-relaxed text-muted-foreground">{summary}</p>
          )}
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <Link
              to={`/${npub}`}
              className="flex items-center gap-2 font-semibold text-foreground hover:text-primary"
            >
              <UserAvatar pubkey={pubkey} size="default" />
              {authorName}
            </Link>
            {publishedAt && (
              <>
                <span aria-hidden="true">·</span>
                <time dateTime={publishedAt.toISOString()}>
                  {publishedAt.toLocaleDateString('en-US', {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </time>
              </>
            )}
          </div>
        </header>

        <Separator />

        <HighlightableMarkdown
          content={event.content}
          className="text-base"
          source={articleHighlightSource(pubkey, ARTICLE_KIND, identifier)}
        />

        <section className="mt-10 space-y-4 border-t border-border/60 pt-6">
          <h2 className="text-xl font-semibold tracking-tight">Discussion</h2>
          <CommentsSection
            root={event}
            emptyStateMessage="No discussion yet"
            emptyStateSubtitle="Share your thoughts on this article with the community."
          />
        </section>
        </DetailSurface>
      </article>
    </Layout>
  );
}

export default ArticlePage;
