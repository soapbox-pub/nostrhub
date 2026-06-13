import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { useCommunityAuthors } from '@/hooks/useCommunityAuthors';
import {
  GRAPH_NODE_KIND,
  GRAPH_EDGE_KIND,
  assembleGraph,
  type PlanGraph,
} from '@/lib/planGraph';

/**
 * Fetches the community plan graph: all kind-32473 nodes and kind-39249
 * edges in a single two-filter query, scoped to the community author set for
 * spam resistance (same policy as comments and chat). Edges pointing at
 * unknown nodes are dropped during assembly.
 */
export function usePlanGraph() {
  const { nostr } = useNostr();
  const community = useCommunityAuthors();
  const communityAuthors = community.data?.authors;

  const query = useQuery<PlanGraph>({
    queryKey: ['plan-graph', communityAuthors?.length ?? null],
    queryFn: async ({ signal }) => {
      const authors = communityAuthors ?? [];
      const events = await nostr.query(
        [
          { kinds: [GRAPH_NODE_KIND], authors, limit: 500 },
          { kinds: [GRAPH_EDGE_KIND], authors, limit: 1000 },
        ],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) },
      );

      // Defensive re-filter in case a relay ignores the authors constraint.
      const allow = new Set(authors);
      const trusted = events.filter((e) => allow.has(e.pubkey));

      return assembleGraph(
        trusted.filter((e) => e.kind === GRAPH_NODE_KIND),
        trusted.filter((e) => e.kind === GRAPH_EDGE_KIND),
      );
    },
    enabled: Boolean(communityAuthors?.length),
    staleTime: 30 * 1000,
  });

  return { ...query, isLoading: query.isLoading || community.isLoading };
}
