import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { ARTICLE_KIND, type ExpertArticle } from '@/hooks/useExpertPress';

export interface SaveArticleParams {
  identifier: string;
  title: string;
  /** Markdown body. */
  content: string;
  summary?: string;
  /** Cover image URL (https). */
  image?: string;
  /** Publish timestamp in seconds; preserved across edits when supplied. */
  publishedAt?: number;
}

/** Build the tag array for a kind-30023 long-form article (NIP-23). */
export function buildArticleTags(params: SaveArticleParams): string[][] {
  const title = params.title.trim();
  const tags: string[][] = [
    ['d', params.identifier.trim()],
    ['title', title],
    ['published_at', String(params.publishedAt ?? Math.floor(Date.now() / 1000))],
    ['alt', `Long-form article: ${title}`],
  ];

  const summary = params.summary?.trim();
  if (summary) tags.push(['summary', summary]);

  const image = params.image?.trim();
  if (image) tags.push(['image', image]);

  return tags;
}

/** Create or update a NIP-23 long-form article (kind 30023). */
export function useSaveArticle() {
  const { mutateAsync: publish } = useNostrPublish();
  const queryClient = useQueryClient();

  return useMutation<NostrEvent, Error, SaveArticleParams>({
    mutationFn: async (params) => {
      return publish({ kind: ARTICLE_KIND, content: params.content.trim(), tags: buildArticleTags(params) });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expert-articles'] });
      queryClient.invalidateQueries({ queryKey: ['community-articles'] });
      queryClient.invalidateQueries({ queryKey: ['expert-press'] });
      queryClient.invalidateQueries({ queryKey: ['article'] });
    },
  });
}

/** Convenience: pull editable fields from an existing parsed article. */
export function articleToParams(article: ExpertArticle): SaveArticleParams {
  return {
    identifier: article.identifier,
    title: article.title,
    content: article.event.content,
    summary: article.summary,
    image: article.image,
    publishedAt: article.publishedAt,
  };
}
