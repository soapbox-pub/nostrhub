import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import {
  GRAPH_EDGE_KIND,
  EDGE_TYPE_LABELS,
  edgeIdentifier,
  type GraphEdgeType,
} from '@/lib/planGraph';

export interface SaveGraphEdgeParams {
  /** Source node address (`32473:<pk>:<d>`). */
  from: string;
  /** Target node address. */
  to: string;
  type: GraphEdgeType;
  /** Short free-text annotation. */
  label?: string;
  /** Longer Markdown note (stored in event content). */
  notes?: string;
}

/**
 * Create (or retype) a plan-graph edge (kind 39249). The `d` tag is
 * deterministic per directed pair, so republishing replaces the author's
 * previous edge between the same two nodes.
 */
export function useSaveGraphEdge() {
  const { mutateAsync: publish } = useNostrPublish();
  const queryClient = useQueryClient();

  return useMutation<NostrEvent, Error, SaveGraphEdgeParams>({
    mutationFn: async ({ from, to, type, label, notes }) => {
      if (from === to) throw new Error('An edge must connect two different nodes');
      const tags: string[][] = [
        ['d', edgeIdentifier(from, to)],
        ['a', from, '', 'from'],
        ['a', to, '', 'to'],
        ['type', type],
        ['alt', `NostrHub plan edge: ${EDGE_TYPE_LABELS[type]}`],
      ];
      if (label?.trim()) tags.push(['label', label.trim()]);
      return publish({ kind: GRAPH_EDGE_KIND, content: notes?.trim() ?? '', tags });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plan-graph'] });
    },
  });
}
