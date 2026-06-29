import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import {
  HIGHLIGHT_KIND,
  buildHighlightTags,
  highlightSourceKey,
  type HighlightSource,
} from '@/lib/highlightSource';

interface CreateHighlightParams {
  /** Highlighted excerpt → event content. */
  text: string;
  /** Required commentary → `comment` tag. */
  comment: string;
  /** Surrounding context → `context` tag. */
  context?: string;
  source: HighlightSource;
}

/**
 * Publish a kind-9802 highlight. The comment is required — callers must pass a
 * non-empty string; this mutation rejects otherwise.
 */
export function useCreateHighlight(): UseMutationResult<NostrEvent, Error, CreateHighlightParams> {
  const { mutateAsync: publishEvent } = useNostrPublish();
  const queryClient = useQueryClient();

  return useMutation<NostrEvent, Error, CreateHighlightParams>({
    mutationFn: async ({ text, comment, context, source }) => {
      const excerpt = text.trim();
      const trimmedComment = comment.trim();
      if (!excerpt) throw new Error('Nothing selected to highlight.');
      if (!trimmedComment) throw new Error('A comment is required to publish a highlight.');

      const tags = buildHighlightTags(source, trimmedComment, context);
      return publishEvent({ kind: HIGHLIGHT_KIND, content: excerpt, tags });
    },
    onSuccess: (_event, { source }) => {
      queryClient.invalidateQueries({ queryKey: ['highlights', highlightSourceKey(source)] });
    },
  });
}
