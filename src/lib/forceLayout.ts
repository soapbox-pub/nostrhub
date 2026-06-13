/**
 * Minimal force-directed layout simulation (no external dependency).
 *
 * Forces per tick:
 * - pairwise repulsion (inverse-square, clamped)
 * - spring attraction along edges toward a target link distance
 * - weak gravity toward the origin (keeps disconnected components together)
 * - velocity damping with decaying alpha
 *
 * Positions are seeded deterministically from the node id so the layout is
 * stable across reloads for the same graph.
 */

export interface SimNode {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Fixed position while dragging (pins the node). */
  fx: number | null;
  fy: number | null;
  /** Visual radius, used to scale repulsion/collision. */
  r: number;
}

export interface SimLink {
  source: string;
  target: string;
  /**
   * Hierarchy links pull harder and sit closer than ordinary connections, so
   * parent/child clusters read as a unit (like orbits in a solar-system map).
   */
  kind?: 'hierarchy' | 'connection';
}

export interface Simulation {
  nodes: SimNode[];
  /** Advance one tick. Returns the current alpha (0 when settled). */
  tick(): number;
  /** Re-heat the simulation (e.g. after data changes or a drag). */
  reheat(alpha?: number): void;
  byId: Map<string, SimNode>;
}

/** Deterministic 32-bit hash for seeding positions. */
function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Seed a node on a deterministic spiral around the origin. */
export function seedPosition(id: string): { x: number; y: number } {
  const h = hash(id);
  const angle = (h % 360) * (Math.PI / 180);
  const radius = 60 + ((h >>> 9) % 240);
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
}

export interface SimulationOptions {
  linkDistance?: number;
  repulsion?: number;
  gravity?: number;
  decay?: number;
}

export function createSimulation(
  nodes: SimNode[],
  links: SimLink[],
  options: SimulationOptions = {},
): Simulation {
  const linkDistance = options.linkDistance ?? 130;
  const repulsion = options.repulsion ?? 2600;
  const gravity = options.gravity ?? 0.03;
  const decay = options.decay ?? 0.985;

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const resolved = links
    .map((l) => ({
      source: byId.get(l.source),
      target: byId.get(l.target),
      kind: l.kind ?? 'connection',
    }))
    .filter((l): l is { source: SimNode; target: SimNode; kind: 'hierarchy' | 'connection' } =>
      Boolean(l.source && l.target),
    );

  let alpha = 1;

  function tick(): number {
    if (alpha < 0.005) return 0;

    // Repulsion between every pair (n is small: a community strategy board).
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let d2 = dx * dx + dy * dy;
        if (d2 === 0) {
          // Nudge coincident nodes apart deterministically.
          dx = ((hash(a.id) % 100) - 50) / 100 || 0.1;
          dy = ((hash(b.id) % 100) - 50) / 100 || -0.1;
          d2 = dx * dx + dy * dy;
        }
        const minD2 = (a.r + b.r) * (a.r + b.r);
        const force = (repulsion * alpha) / Math.max(d2, minD2 * 0.5);
        const d = Math.sqrt(d2);
        const fx = (dx / d) * force;
        const fy = (dy / d) * force;
        a.vx -= fx;
        a.vy -= fy;
        b.vx += fx;
        b.vy += fy;
      }
    }

    // Springs along links. Hierarchy links are shorter and stiffer so
    // parent/child groups cluster tightly.
    for (const { source, target, kind } of resolved) {
      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const targetD = kind === 'hierarchy' ? linkDistance * 0.62 : linkDistance;
      const stiffness = kind === 'hierarchy' ? 0.16 : 0.08;
      const stretch = ((d - targetD) / d) * stiffness * alpha * 10;
      const fx = dx * stretch;
      const fy = dy * stretch;
      source.vx += fx / 2;
      source.vy += fy / 2;
      target.vx -= fx / 2;
      target.vy -= fy / 2;
    }

    // Gravity + integrate.
    for (const n of nodes) {
      n.vx -= n.x * gravity * alpha;
      n.vy -= n.y * gravity * alpha;
      n.vx *= 0.6;
      n.vy *= 0.6;
      if (n.fx != null && n.fy != null) {
        n.x = n.fx;
        n.y = n.fy;
        n.vx = 0;
        n.vy = 0;
      } else {
        n.x += n.vx;
        n.y += n.vy;
      }
    }

    alpha *= decay;
    return alpha;
  }

  function reheat(value = 0.5) {
    alpha = Math.max(alpha, value);
  }

  return { nodes, tick, reheat, byId };
}
