import { useNostr } from '@nostrify/react';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import {
  HIGHLIGHT_KIND,
  highlightSourceFilter,
  highlightSourceKey,
  parseHighlight,
  type HighlightSource,
  type ParsedHighlight,
} from '@/lib/highlightSource';

/**
 * Fetch all community highlights (kind 9802) referencing a given source —
 * an article, custom NIP, or official NIP URL. Only well-formed highlights
 * (non-empty excerpt + comment) are returned, newest first.
 */
export function useHighlights(
  source: HighlightSource | undefined,
): UseQueryResult<ParsedHighlight[]> {
  const { nostr } = useNostr();

  return useQuery<ParsedHighlight[]>({
    queryKey: ['highlights', source ? highlightSourceKey(source) : 'none'],
    enabled: !!source,
    staleTime: 30 * 1000,
    queryFn: async ({ signal }) => {
      if (!source) return [];
      const filter = { ...highlightSourceFilter(source), limit: 200 };
      const events = await nostr.query([filter], {
        signal: AbortSignal.any([signal, AbortSignal.timeout(6000)]),
      });

      const parsed = events
        .filter((e) => e.kind === HIGHLIGHT_KIND)
        .map(parseHighlight)
        .filter((h): h is ParsedHighlight => h !== null);

      // Newest first; de-dupe by event id.
      const seen = new Set<string>();
      return parsed
        .sort((a, b) => b.event.created_at - a.event.created_at)
        .filter((h) => {
          if (seen.has(h.event.id)) return false;
          seen.add(h.event.id);
          return true;
        });
    },
  });
}
