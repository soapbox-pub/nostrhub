import { useEffect, useRef, useState } from 'react';
import { Maximize2, Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthor } from '@/hooks/useAuthor';
import { cn } from '@/lib/utils';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import {
  createSimulation,
  seedPosition,
  type SimNode,
  type Simulation,
} from '@/lib/forceLayout';
import {
  isEntityType,
  radiusForDepth,
  type GraphEdge,
  type GraphEdgeType,
  type GraphNode,
  type GraphNodeType,
  type HierarchyLink,
} from '@/lib/planGraph';

interface GraphCanvasProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  hierarchy: HierarchyLink[];
  /** Address of the currently selected node. */
  selectedAddress: string | null;
  /** Address of the node a new connection starts from (connect mode). */
  connectFrom?: string | null;
  /** Active topic filter — non-matching nodes are dimmed (not removed). */
  activeTopic?: string | null;
  onSelectNode: (address: string | null) => void;
  className?: string;
}

const NODE_FILL: Record<GraphNodeType, string> = {
  goal: 'fill-violet-500',
  problem: 'fill-rose-500',
  task: 'fill-sky-500',
  person: 'fill-emerald-500',
  org: 'fill-amber-500',
  concept: 'fill-teal-500',
  object: 'fill-fuchsia-500',
};

/** Build an SVG hexagon path of "radius" r, point-up. Used for `object` nodes. */
function hexagonPoints(r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 2;
    pts.push(`${(r * Math.cos(angle)).toFixed(2)},${(r * Math.sin(angle)).toFixed(2)}`);
  }
  return pts.join(' ');
}

const EDGE_CLASS: Partial<Record<GraphEdgeType, string>> = {
  'depends-on': 'stroke-muted-foreground',
  'blocks': 'stroke-rose-500',
  'supports': 'stroke-emerald-500',
  'relates': 'stroke-muted-foreground/60',
};
const edgeClass = (type: GraphEdgeType) => EDGE_CLASS[type] ?? 'stroke-muted-foreground/70';

const EDGE_DASH: Partial<Record<GraphEdgeType, string>> = {
  'blocks': '6 4',
  'relates': '2 4',
};

/** Edges that draw an arrowhead (directional). `relates` and `works-with` are undirected. */
const UNDIRECTED_EDGES = new Set<GraphEdgeType>(['relates', 'works-with']);

interface Transform {
  x: number;
  y: number;
  k: number;
}

type DragState =
  | { mode: 'pan'; pointerId: number; startX: number; startY: number; origin: Transform; moved: boolean }
  | { mode: 'node'; pointerId: number; id: string; startX: number; startY: number; moved: boolean };

/**
 * Interactive force-directed SVG canvas. Layout is computed client-side and
 * never persisted — drag to nudge, scroll to zoom, drag the background to pan.
 */
export function GraphCanvas({
  nodes,
  edges,
  hierarchy,
  selectedAddress,
  connectFrom,
  activeTopic,
  onSelectNode,
  className,
}: GraphCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const simRef = useRef<Simulation | null>(null);
  const rafRef = useRef<number | null>(null);
  const startLoopRef = useRef<() => void>(() => {});
  const dragRef = useRef<DragState | null>(null);
  const centeredRef = useRef(false);

  /** Live node positions, snapshotted from the simulation each animation frame. */
  const [positions, setPositions] = useState<ReadonlyMap<string, SimNode>>(new Map());
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, k: 1 });

  // Track container size; center the origin on first measure.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0].contentRect;
      setSize({ width: rect.width, height: rect.height });
      if (!centeredRef.current && rect.width > 0) {
        centeredRef.current = true;
        setTransform({ x: rect.width / 2, y: rect.height / 2, k: 1 });
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // (Re)build the simulation when graph data changes, preserving positions,
  // and drive it with requestAnimationFrame until it settles.
  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const previous = simRef.current?.byId;
    const simNodes: SimNode[] = nodes.map((node) => {
      const existing = previous?.get(node.address);
      const r = radiusForDepth(node.depth);
      if (existing) return { ...existing, r, fx: null, fy: null };
      const seed = seedPosition(node.address);
      return { id: node.address, x: seed.x, y: seed.y, vx: 0, vy: 0, fx: null, fy: null, r };
    });
    const links = [
      ...hierarchy.map((h) => ({ source: h.parent, target: h.child, kind: 'hierarchy' as const })),
      ...edges.map((e) => ({ source: e.from, target: e.to, kind: 'connection' as const })),
    ];
    const sim = createSimulation(simNodes, links);
    simRef.current = sim;

    const step = () => {
      let alpha = sim.tick();
      if (reducedMotion) {
        // Settle in a single frame instead of animating.
        let i = 0;
        while (alpha > 0 && i < 600) {
          alpha = sim.tick();
          i++;
        }
      }
      setPositions(new Map(sim.byId));
      rafRef.current = alpha > 0 ? requestAnimationFrame(step) : null;
    };
    const start = () => {
      if (rafRef.current == null) rafRef.current = requestAnimationFrame(step);
    };
    startLoopRef.current = start;

    sim.reheat(1);
    start();

    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [nodes, edges, hierarchy]);

  // Native wheel listener (non-passive) so zooming doesn't scroll the page.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      setTransform((t) => {
        const k = Math.min(4, Math.max(0.2, t.k * Math.exp(-e.deltaY * 0.0015)));
        return {
          k,
          x: cx - ((cx - t.x) / t.k) * k,
          y: cy - ((cy - t.y) / t.k) * k,
        };
      });
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, []);

  const toWorld = (clientX: number, clientY: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    const sx = clientX - (rect?.left ?? 0);
    const sy = clientY - (rect?.top ?? 0);
    return { x: (sx - transform.x) / transform.k, y: (sy - transform.y) / transform.k };
  };

  const onBackgroundPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.target !== e.currentTarget && (e.target as Element).getAttribute('data-bg') !== 'true') return;
    dragRef.current = {
      mode: 'pan',
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origin: transform,
      moved: false,
    };
    svgRef.current?.setPointerCapture(e.pointerId);
  };

  const onNodePointerDown = (e: React.PointerEvent, id: string) => {
    e.stopPropagation();
    dragRef.current = { mode: 'node', pointerId: e.pointerId, id, startX: e.clientX, startY: e.clientY, moved: false };
    svgRef.current?.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;

    if (drag.mode === 'pan') {
      setTransform({ ...drag.origin, x: drag.origin.x + dx, y: drag.origin.y + dy });
    } else if (drag.moved) {
      const node = simRef.current?.byId.get(drag.id);
      if (node) {
        const world = toWorld(e.clientX, e.clientY);
        node.fx = world.x;
        node.fy = world.y;
        simRef.current?.reheat(0.3);
        startLoopRef.current();
      }
    }
  };

  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    dragRef.current = null;
    svgRef.current?.releasePointerCapture(e.pointerId);

    if (drag.mode === 'node') {
      const node = simRef.current?.byId.get(drag.id);
      if (node) {
        node.fx = null;
        node.fy = null;
      }
      if (!drag.moved) onSelectNode(drag.id);
    } else if (!drag.moved) {
      onSelectNode(null);
    }
  };

  const fitView = () => {
    if (positions.size === 0 || size.width === 0) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of positions.values()) {
      minX = Math.min(minX, n.x - 60);
      minY = Math.min(minY, n.y - 60);
      maxX = Math.max(maxX, n.x + 60);
      maxY = Math.max(maxY, n.y + 60);
    }
    const k = Math.min(2, Math.max(0.2, Math.min(size.width / (maxX - minX), size.height / (maxY - minY))));
    setTransform({
      k,
      x: size.width / 2 - ((minX + maxX) / 2) * k,
      y: size.height / 2 - ((minY + maxY) / 2) * k,
    });
  };

  const zoomBy = (factor: number) => {
    setTransform((t) => {
      const k = Math.min(4, Math.max(0.2, t.k * factor));
      const cx = size.width / 2;
      const cy = size.height / 2;
      return { k, x: cx - ((cx - t.x) / t.k) * k, y: cy - ((cy - t.y) / t.k) * k };
    });
  };

  return (
    <div ref={containerRef} className={cn('relative h-full w-full overflow-hidden', className)}>
      <svg
        ref={svgRef}
        role="application"
        aria-label="Plan graph canvas"
        className="h-full w-full touch-none select-none cursor-grab active:cursor-grabbing"
        onPointerDown={onBackgroundPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <defs>
          <marker id="arrow-default" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" className="fill-muted-foreground" />
          </marker>
          <marker id="arrow-blocks" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" className="fill-rose-500" />
          </marker>
          <marker id="arrow-supports" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" className="fill-emerald-500" />
          </marker>
        </defs>

        {/* Invisible hit area so background clicks deselect/pan anywhere. */}
        <rect data-bg="true" width="100%" height="100%" fill="transparent" />

        <g transform={`translate(${transform.x},${transform.y}) scale(${transform.k})`}>
          {/* Hierarchy links: thick, faint, no arrowhead — the "orbit" layer. */}
          {hierarchy.map((link) => {
            const parent = positions.get(link.parent);
            const child = positions.get(link.child);
            if (!parent || !child) return null;
            return (
              <line
                key={`${link.parent}|${link.child}`}
                x1={parent.x}
                y1={parent.y}
                x2={child.x}
                y2={child.y}
                strokeWidth={3}
                className="stroke-primary/15"
              />
            );
          })}

          {edges.map((edge) => {
            const from = positions.get(edge.from);
            const to = positions.get(edge.to);
            if (!from || !to) return null;
            // Trim the line so the arrowhead lands on the node border.
            const dx = to.x - from.x;
            const dy = to.y - from.y;
            const d = Math.sqrt(dx * dx + dy * dy) || 1;
            const tx = to.x - (dx / d) * (to.r + 4);
            const ty = to.y - (dy / d) * (to.r + 4);
            const sx = from.x + (dx / d) * (from.r + 2);
            const sy = from.y + (dy / d) * (from.r + 2);
            const arrow = UNDIRECTED_EDGES.has(edge.type)
              ? undefined
              : edge.type === 'blocks'
                ? 'url(#arrow-blocks)'
                : edge.type === 'supports'
                  ? 'url(#arrow-supports)'
                  : 'url(#arrow-default)';
            return (
              <g key={edge.address}>
                <line
                  x1={sx}
                  y1={sy}
                  x2={tx}
                  y2={ty}
                  strokeWidth={1.5}
                  strokeDasharray={EDGE_DASH[edge.type]}
                  markerEnd={arrow}
                  className={cn('transition-opacity', edgeClass(edge.type))}
                />
                {edge.label && (
                  <text
                    x={(sx + tx) / 2}
                    y={(sy + ty) / 2 - 3}
                    textAnchor="middle"
                    className="fill-muted-foreground text-[9px] pointer-events-none"
                  >
                    {edge.label.length > 24 ? `${edge.label.slice(0, 23)}…` : edge.label}
                  </text>
                )}
              </g>
            );
          })}

          {nodes.map((node) => {
            const pos = positions.get(node.address);
            if (!pos) return null;
            return (
              <GraphNodeShape
                key={node.address}
                node={node}
                x={pos.x}
                y={pos.y}
                r={pos.r}
                selected={node.address === selectedAddress}
                isConnectSource={node.address === connectFrom}
                dimmed={Boolean(activeTopic) && !node.topics.includes(activeTopic!)}
                onPointerDown={onNodePointerDown}
                onSelect={onSelectNode}
              />
            );
          })}
        </g>
      </svg>

      {/* Zoom controls */}
      <div className="absolute bottom-4 right-4 flex flex-col gap-1.5">
        <Button variant="outline" size="icon" aria-label="Zoom in" onClick={() => zoomBy(1.3)}>
          <Plus className="size-4" />
        </Button>
        <Button variant="outline" size="icon" aria-label="Zoom out" onClick={() => zoomBy(1 / 1.3)}>
          <Minus className="size-4" />
        </Button>
        <Button variant="outline" size="icon" aria-label="Fit graph in view" onClick={fitView}>
          <Maximize2 className="size-4" />
        </Button>
      </div>

      {/* Legend */}
      <div className="absolute bottom-4 left-4 hidden sm:grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg border border-border/60 bg-background/80 px-3 py-2 text-xs text-muted-foreground backdrop-blur">
        <span className="flex items-center gap-2">
          <span className="inline-block size-3 rounded-full bg-violet-500" aria-hidden="true" /> Goal
        </span>
        <span className="flex items-center gap-2">
          <span className="inline-block size-3 rounded-full bg-rose-500" aria-hidden="true" /> Problem
        </span>
        <span className="flex items-center gap-2">
          <span className="inline-block size-3 rounded-full bg-sky-500" aria-hidden="true" /> Task
        </span>
        <span className="flex items-center gap-2">
          <span className="inline-block size-3 rounded-full bg-emerald-500" aria-hidden="true" /> Person
        </span>
        <span className="flex items-center gap-2">
          <span className="inline-block size-3 rounded-[3px] bg-amber-500" aria-hidden="true" /> Org
        </span>
        <span className="flex items-center gap-2">
          <span
            className="inline-block size-3 rounded-full border-2 border-dashed border-teal-500"
            aria-hidden="true"
          />{' '}
          Concept
        </span>
        <span className="flex items-center gap-2">
          <span
            className="inline-block size-3 rotate-90 bg-fuchsia-500"
            style={{ clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)' }}
            aria-hidden="true"
          />{' '}
          Object
        </span>
      </div>
    </div>
  );
}

interface GraphNodeShapeProps {
  node: GraphNode;
  x: number;
  y: number;
  r: number;
  selected: boolean;
  isConnectSource: boolean;
  dimmed: boolean;
  onPointerDown: (e: React.PointerEvent, id: string) => void;
  onSelect: (address: string) => void;
}

/**
 * Renders a single node. Split into its own component so `person` nodes can use
 * the `useAuthor` hook to fetch and display the real profile avatar.
 */
function GraphNodeShape({
  node,
  x,
  y,
  r,
  selected,
  isConnectSource,
  dimmed,
  onPointerDown,
  onSelect,
}: GraphNodeShapeProps) {
  // Only person nodes with a bound identity need profile data.
  const author = useAuthor(node.type === 'person' ? node.subject : undefined);
  const picture = sanitizeUrl(author.data?.metadata?.picture);
  const isPerson = node.type === 'person';
  const isOrg = node.type === 'org';
  const isConcept = node.type === 'concept';
  const isObject = node.type === 'object';
  const entity = isEntityType(node.type);
  const done = node.status === 'done' || node.status === 'dropped';
  const clipId = `clip-${node.address}`;

  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={`${node.type}: ${node.title}`}
      transform={`translate(${x},${y})`}
      className={cn('cursor-pointer outline-none transition-opacity', dimmed && 'opacity-20')}
      onPointerDown={(e) => onPointerDown(e, node.address)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(node.address);
        }
      }}
    >
      {(selected || isConnectSource) && (
        <circle
          r={r + 6}
          className={cn(
            'fill-none stroke-2',
            isConnectSource ? 'stroke-amber-400 motion-safe:animate-pulse' : 'stroke-primary',
          )}
        />
      )}

      {isOrg ? (
        // Organizations render as a rounded square to read as "container".
        <rect
          x={-r}
          y={-r}
          width={r * 2}
          height={r * 2}
          rx={r * 0.35}
          className={cn(NODE_FILL[node.type], 'stroke-background stroke-2')}
        />
      ) : isObject ? (
        // Objects render as a hexagon to read as a concrete "artifact".
        <polygon
          points={hexagonPoints(r)}
          className={cn(NODE_FILL[node.type], 'stroke-background stroke-2')}
        />
      ) : isConcept ? (
        // Concepts render as a dashed-outline circle to read as "abstract".
        <>
          <circle r={r} className={cn(NODE_FILL[node.type], 'opacity-25')} />
          <circle
            r={r - 1}
            strokeWidth={2}
            strokeDasharray="3 3"
            className={cn(
              NODE_FILL[node.type].replace('fill-', 'stroke-'),
              'fill-none',
            )}
          />
        </>
      ) : isPerson && picture ? (
        <>
          <clipPath id={clipId}>
            <circle r={r} />
          </clipPath>
          <circle r={r + 1} className="fill-emerald-500" />
          <image
            href={picture}
            x={-r}
            y={-r}
            width={r * 2}
            height={r * 2}
            clipPath={`url(#${clipId})`}
            preserveAspectRatio="xMidYMid slice"
          />
          <circle r={r} className="fill-none stroke-background stroke-2" />
        </>
      ) : (
        <circle
          r={r}
          className={cn(
            NODE_FILL[node.type],
            'stroke-background stroke-2 transition-opacity',
            !entity && done && 'opacity-45',
          )}
        />
      )}

      {/* Work-item status decorations (entities have no status). */}
      {!entity && node.status === 'in-progress' && (
        <circle r={r - 3} className="fill-none stroke-amber-300" strokeWidth={2} strokeDasharray="4 4" />
      )}
      {!entity && node.status === 'blocked' && (
        <circle r={r - 3} className="fill-none stroke-rose-400" strokeWidth={2} strokeDasharray="2 3" />
      )}
      {!entity && node.status === 'done' && (
        <path
          d="M -6 0 L -2 5 L 7 -5"
          className="fill-none stroke-white"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}

      <text
        y={r + 14}
        textAnchor="middle"
        className="fill-foreground text-[11px] font-medium pointer-events-none"
      >
        {node.title.length > 28 ? `${node.title.slice(0, 27)}…` : node.title}
      </text>
    </g>
  );
}
