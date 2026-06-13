import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import {
  GRAPH_NODE_KIND,
  NODE_TYPE_LABELS,
  isEntityType,
  type GraphNodeType,
  type GraphNodeStatus,
} from '@/lib/planGraph';

export interface SaveGraphNodeParams {
  /** `d` tag identifier (slug). */
  identifier: string;
  title: string;
  type: GraphNodeType;
  /** Lifecycle status — only written for work-item types. */
  status: GraphNodeStatus;
  /** Markdown description. */
  content: string;
  /** For `person` nodes: the pubkey (hex) this node represents. */
  subject?: string;
  /** Parent node addresses (`32473:<pk>:<d>`) — the hierarchy layer. */
  parents?: string[];
  /** Topic tags for grouping/filtering. */
  topics?: string[];
  /** Pubkeys (hex) of people involved/assigned. */
  people?: string[];
  /** Anchors to related entities (address coordinates, e.g. `30817:<pk>:<d>`). */
  anchors?: string[];
}

/** Create or update a plan-graph node (kind 32473). */
export function useSaveGraphNode() {
  const { mutateAsync: publish } = useNostrPublish();
  const queryClient = useQueryClient();

  return useMutation<NostrEvent, Error, SaveGraphNodeParams>({
    mutationFn: async (params) => {
      const title = params.title.trim();
      const entity = isEntityType(params.type);
      const tags: string[][] = [
        ['d', params.identifier],
        ['title', title],
        ['type', params.type],
        ['alt', `NostrHub plan node (${NODE_TYPE_LABELS[params.type].toLowerCase()}): ${title}`],
      ];
      // Status only applies to work items.
      if (!entity) tags.push(['status', params.status]);
      // A person node may bind to a real identity.
      if (params.type === 'person' && params.subject?.trim()) {
        tags.push(['p', params.subject.trim(), '', 'subject']);
      }
      for (const parent of params.parents ?? []) {
        if (parent.trim()) tags.push(['a', parent.trim(), '', 'parent']);
      }
      for (const topic of params.topics ?? []) {
        if (topic.trim()) tags.push(['t', topic.trim().toLowerCase()]);
      }
      for (const pubkey of params.people ?? []) {
        if (pubkey.trim()) tags.push(['p', pubkey.trim()]);
      }
      for (const anchor of params.anchors ?? []) {
        if (anchor.trim()) tags.push(['a', anchor.trim()]);
      }
      return publish({ kind: GRAPH_NODE_KIND, content: params.content.trim(), tags });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plan-graph'] });
    },
  });
}
