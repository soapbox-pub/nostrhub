import type { NostrEvent } from '@nostrify/nostrify';
import { nip19 } from 'nostr-tools';

/** Addressable event kind for a strategy-graph node (goal / problem / task). */
export const GRAPH_NODE_KIND = 32473;
/** Addressable event kind for a typed edge between two strategy nodes. */
export const GRAPH_EDGE_KIND = 39249;

/**
 * Node types fall into two families:
 * - **work items** (goal/problem/task) — abstract things with a lifecycle status.
 * - **entities** (person/org) — actors in the ecosystem; status is meaningless,
 *   and a `person` may bind to a real Nostr identity (subject pubkey).
 */
export const WORK_ITEM_TYPES = ['goal', 'problem', 'task'] as const;
export const ENTITY_TYPES = ['person', 'org'] as const;
export const NODE_TYPES = [...WORK_ITEM_TYPES, ...ENTITY_TYPES] as const;
export type GraphNodeType = (typeof NODE_TYPES)[number];

export function isEntityType(type: string): boolean {
  return (ENTITY_TYPES as readonly string[]).includes(type);
}

export const NODE_STATUSES = ['open', 'in-progress', 'blocked', 'done', 'dropped'] as const;
export type GraphNodeStatus = (typeof NODE_STATUSES)[number];

/**
 * Edge types: work-flow relations (depends-on/blocks/supports/relates) plus
 * relationship relations for entities (leads/funds/works-with/advises/builds).
 */
export const EDGE_TYPES = [
  'depends-on',
  'blocks',
  'supports',
  'relates',
  'leads',
  'funds',
  'works-with',
  'advises',
  'builds',
] as const;
export type GraphEdgeType = (typeof EDGE_TYPES)[number];

export interface GraphNode {
  event: NostrEvent;
  /** `d` tag identifier. */
  identifier: string;
  /** Address coordinate `32473:<pubkey>:<d>` — the node's id in the graph. */
  address: string;
  title: string;
  type: GraphNodeType;
  status: GraphNodeStatus;
  /** Markdown description. */
  content: string;
  author: string;
  createdAt: number;
  /**
   * For `person` entity nodes: the pubkey this node represents (`p` tag with
   * `subject` marker). Lets the node render the real profile avatar/name.
   */
  subject?: string;
  /** Parent node addresses (`a` tags with `parent` marker) — the hierarchy layer. */
  parents: string[];
  /** Topic tags (`t`) for grouping/filtering subgraphs. */
  topics: string[];
  /** Pubkeys of people involved/assigned (plain `p` tags, excluding the subject). */
  people: string[];
  /** Anchors to related entities (`a` tags without a marker). */
  anchors: string[];
  /** naddr-encoded reference. */
  naddr: string;
  /**
   * Hierarchy depth, computed during assembly: 0 for roots, 1 + min(parent
   * depths) otherwise. Drives visual scale (sun/planet/moon), never stored.
   */
  depth: number;
}

/** A resolved parent→child hierarchy link, derived from node `parent` tags. */
export interface HierarchyLink {
  parent: string;
  child: string;
}

export interface GraphEdge {
  event: NostrEvent;
  identifier: string;
  /** Address coordinate `39249:<pubkey>:<d>`. */
  address: string;
  /** Source node address (`from` marker). */
  from: string;
  /** Target node address (`to` marker). */
  to: string;
  type: GraphEdgeType;
  /** Short free-text annotation (`label` tag), e.g. "needs NIP-44 first". */
  label: string;
  /** Longer Markdown note (event content). */
  notes: string;
  author: string;
  createdAt: number;
}

export interface StrategyGraph {
  nodes: GraphNode[];
  /** Edges whose `from` and `to` both resolve to a known node. */
  edges: GraphEdge[];
  /** Parent→child links from node `parent` tags whose endpoints both resolve. */
  hierarchy: HierarchyLink[];
  nodesByAddress: Map<string, GraphNode>;
  /** All distinct topics across nodes, sorted by frequency then name. */
  topics: string[];
}

const tag = (event: NostrEvent, name: string): string | undefined =>
  event.tags.find(([n]) => n === name)?.[1];

const isNodeType = (v: string | undefined): v is GraphNodeType =>
  NODE_TYPES.includes(v as GraphNodeType);

const isNodeStatus = (v: string | undefined): v is GraphNodeStatus =>
  NODE_STATUSES.includes(v as GraphNodeStatus);

const isEdgeType = (v: string | undefined): v is GraphEdgeType =>
  EDGE_TYPES.includes(v as GraphEdgeType);

/** A node is valid if it has `d`, `title`, and a recognized `type`. */
export function isValidGraphNode(event: NostrEvent): boolean {
  if (event.kind !== GRAPH_NODE_KIND) return false;
  return Boolean(tag(event, 'd') !== undefined && tag(event, 'title') && isNodeType(tag(event, 'type')));
}

export function parseGraphNode(event: NostrEvent): GraphNode {
  const identifier = tag(event, 'd') ?? '';
  const status = tag(event, 'status');

  const parents: string[] = [];
  const anchors: string[] = [];
  for (const [n, v, , marker] of event.tags) {
    if (n !== 'a' || !v) continue;
    if (marker === 'parent') parents.push(v);
    else if (!marker) anchors.push(v);
  }

  const topics = event.tags.filter(([n, v]) => n === 't' && Boolean(v)).map(([, v]) => v);

  // The `subject` p-tag binds a person node to a real identity; plain p-tags
  // are people involved. Keep them distinct.
  const subject = event.tags.find(
    ([n, v, , marker]) => n === 'p' && marker === 'subject' && typeof v === 'string' && v.length === 64,
  )?.[1];
  const people = event.tags
    .filter(([n, v, , marker]) => n === 'p' && marker !== 'subject' && typeof v === 'string' && v.length === 64)
    .map(([, v]) => v);

  return {
    event,
    identifier,
    address: `${GRAPH_NODE_KIND}:${event.pubkey}:${identifier}`,
    title: tag(event, 'title') ?? 'Untitled',
    type: isNodeType(tag(event, 'type')) ? (tag(event, 'type') as GraphNodeType) : 'task',
    status: isNodeStatus(status) ? status : 'open',
    content: event.content,
    author: event.pubkey,
    createdAt: event.created_at,
    subject,
    parents: Array.from(new Set(parents)),
    topics: Array.from(new Set(topics)),
    people: Array.from(new Set(people)),
    anchors,
    naddr: nip19.naddrEncode({ kind: GRAPH_NODE_KIND, pubkey: event.pubkey, identifier }),
    depth: 0, // filled in during assembly
  };
}

/** An edge is valid if it has `from` + `to` markers on node addresses and a recognized `type`. */
export function isValidGraphEdge(event: NostrEvent): boolean {
  if (event.kind !== GRAPH_EDGE_KIND) return false;
  const from = event.tags.find(([n, v, , marker]) => n === 'a' && Boolean(v) && marker === 'from');
  const to = event.tags.find(([n, v, , marker]) => n === 'a' && Boolean(v) && marker === 'to');
  return Boolean(from && to && from[1] !== to[1] && isEdgeType(tag(event, 'type')));
}

export function parseGraphEdge(event: NostrEvent): GraphEdge {
  const from = event.tags.find(([n, , , marker]) => n === 'a' && marker === 'from')?.[1] ?? '';
  const to = event.tags.find(([n, , , marker]) => n === 'a' && marker === 'to')?.[1] ?? '';
  const identifier = tag(event, 'd') ?? '';

  return {
    event,
    identifier,
    address: `${GRAPH_EDGE_KIND}:${event.pubkey}:${identifier}`,
    from,
    to,
    type: isEdgeType(tag(event, 'type')) ? (tag(event, 'type') as GraphEdgeType) : 'relates',
    label: tag(event, 'label') ?? '',
    notes: event.content,
    author: event.pubkey,
    createdAt: event.created_at,
  };
}

/** Deterministic edge `d` tag: one edge per author per directed node pair. */
export function edgeIdentifier(from: string, to: string): string {
  return `${from}->${to}`;
}

/**
 * Assemble parsed nodes and edges into a coherent graph:
 * - keeps the newest revision per node/edge address,
 * - resolves the parent hierarchy and computes each node's depth (cycle-safe),
 * - drops edges/parent-links that reference unknown nodes,
 * - dedupes identical directed pairs from multiple authors (keeps the newest).
 */
export function assembleGraph(nodeEvents: NostrEvent[], edgeEvents: NostrEvent[]): StrategyGraph {
  const nodesByAddress = new Map<string, GraphNode>();
  for (const event of nodeEvents) {
    if (!isValidGraphNode(event)) continue;
    const node = parseGraphNode(event);
    const prev = nodesByAddress.get(node.address);
    if (!prev || event.created_at > prev.createdAt) nodesByAddress.set(node.address, node);
  }

  // Resolve the hierarchy: keep only parent links whose parent node exists, and
  // ignore self-references.
  const hierarchy: HierarchyLink[] = [];
  for (const node of nodesByAddress.values()) {
    const resolvedParents = node.parents.filter(
      (p) => p !== node.address && nodesByAddress.has(p),
    );
    node.parents = resolvedParents;
    for (const parent of resolvedParents) hierarchy.push({ parent, child: node.address });
  }

  // Compute depth = 1 + min(parent depth), with roots at 0. BFS from roots is
  // cycle-safe: nodes only reachable through a cycle never get visited and keep
  // depth 0 (treated as roots), so the layout stays well-defined.
  for (const node of nodesByAddress.values()) node.depth = node.parents.length === 0 ? 0 : Infinity;
  const childrenOf = new Map<string, string[]>();
  for (const { parent, child } of hierarchy) {
    (childrenOf.get(parent) ?? childrenOf.set(parent, []).get(parent)!).push(child);
  }
  let frontier = Array.from(nodesByAddress.values()).filter((n) => n.depth === 0).map((n) => n.address);
  let guard = 0;
  while (frontier.length && guard++ < nodesByAddress.size + 1) {
    const next: string[] = [];
    for (const addr of frontier) {
      const parentDepth = nodesByAddress.get(addr)!.depth;
      for (const child of childrenOf.get(addr) ?? []) {
        const childNode = nodesByAddress.get(child)!;
        if (parentDepth + 1 < childNode.depth) {
          childNode.depth = parentDepth + 1;
          next.push(child);
        }
      }
    }
    frontier = next;
  }
  // Any node left at Infinity is trapped in a cycle — clamp to 0.
  for (const node of nodesByAddress.values()) {
    if (!Number.isFinite(node.depth)) node.depth = 0;
  }

  const edgesByAddress = new Map<string, GraphEdge>();
  for (const event of edgeEvents) {
    if (!isValidGraphEdge(event)) continue;
    const edge = parseGraphEdge(event);
    if (!nodesByAddress.has(edge.from) || !nodesByAddress.has(edge.to)) continue;
    const prev = edgesByAddress.get(edge.address);
    if (!prev || event.created_at > prev.createdAt) edgesByAddress.set(edge.address, edge);
  }

  // Collapse duplicate directed pairs across authors (newest wins) so the
  // canvas doesn't draw stacked lines.
  const edgesByPair = new Map<string, GraphEdge>();
  for (const edge of edgesByAddress.values()) {
    const pair = `${edge.from}->${edge.to}`;
    const prev = edgesByPair.get(pair);
    if (!prev || edge.createdAt > prev.createdAt) edgesByPair.set(pair, edge);
  }

  // Topic frequencies for the filter bar.
  const topicCounts = new Map<string, number>();
  for (const node of nodesByAddress.values()) {
    for (const topic of node.topics) topicCounts.set(topic, (topicCounts.get(topic) ?? 0) + 1);
  }
  const topics = Array.from(topicCounts.entries())
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .map(([t]) => t);

  const nodes = Array.from(nodesByAddress.values()).sort((a, b) => b.createdAt - a.createdAt);
  const edges = Array.from(edgesByPair.values());

  return { nodes, edges, hierarchy, nodesByAddress, topics };
}

export const NODE_TYPE_LABELS: Record<GraphNodeType, string> = {
  goal: 'Goal',
  problem: 'Problem',
  task: 'Task',
  person: 'Person',
  org: 'Organization',
};

export const NODE_STATUS_LABELS: Record<GraphNodeStatus, string> = {
  'open': 'Open',
  'in-progress': 'In progress',
  'blocked': 'Blocked',
  'done': 'Done',
  'dropped': 'Dropped',
};

export const EDGE_TYPE_LABELS: Record<GraphEdgeType, string> = {
  'depends-on': 'depends on',
  'blocks': 'blocks',
  'supports': 'supports',
  'relates': 'relates to',
  'leads': 'leads',
  'funds': 'funds',
  'works-with': 'works with',
  'advises': 'advises',
  'builds': 'builds',
};

/**
 * Visual radius by hierarchy depth (sun → planet → moon → submoon), mirroring
 * Soapbox Galaxy's depth-derived scale. Scale communicates scope; the node
 * *type* (goal/problem/task) communicates nature — the two are independent.
 */
export function radiusForDepth(depth: number): number {
  const radii = [30, 22, 17, 13];
  return radii[Math.min(depth, radii.length - 1)];
}

/** Human label for a node's hierarchy tier, for tooltips/legends. */
export function tierForDepth(depth: number): string {
  return ['Sun', 'Planet', 'Moon', 'Submoon'][Math.min(depth, 3)];
}

/**
 * Addresses of `root` and all its descendants via the hierarchy — used to keep
 * the parent picker acyclic (a node may not parent itself or its descendants).
 */
export function descendantsOf(root: string, hierarchy: HierarchyLink[]): Set<string> {
  const childrenOf = new Map<string, string[]>();
  for (const { parent, child } of hierarchy) {
    (childrenOf.get(parent) ?? childrenOf.set(parent, []).get(parent)!).push(child);
  }
  const out = new Set<string>([root]);
  const stack = [root];
  while (stack.length) {
    const current = stack.pop()!;
    for (const child of childrenOf.get(current) ?? []) {
      if (!out.has(child)) {
        out.add(child);
        stack.push(child);
      }
    }
  }
  return out;
}
