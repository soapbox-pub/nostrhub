/**
 * Compute how many commits a PR tip is ahead of / behind the target branch,
 * GitHub-style, entirely in the browser — cheaply.
 *
 * Instead of a full shallow fetch (isomorphic-git downloads every tree and
 * blob, which for large repositories means enormous packfiles), this asks the
 * GRASP mirror for a `filter tree:0` commits-only pack: one round-trip for
 * the ref advertisement, one for a pack containing just the commit objects
 * reachable from the two heads (depth-capped). That's a few hundred bytes per
 * commit no matter how big the repository is.
 *
 * With the graph in hand:
 *
 *   ahead  = |reachable(tip)    \ reachable(target)|
 *   behind = |reachable(target) \ reachable(tip)|
 *
 * When the two histories don't meet within the depth cap, the counts are
 * unknowable from the fetched data and `null` is returned.
 */

import { fetchCommitGraph, fetchRefAdvertisement } from '@/lib/gitCommitFetch';

export interface AheadBehind {
  /** Commits on the PR tip that aren't on the target branch (null = unknown). */
  ahead: number | null;
  /** Commits on the target branch that aren't on the PR tip (null = unknown). */
  behind: number | null;
  /** The branch compared against, e.g. `main`. */
  targetRef?: string;
  /** The fetch depth cap. */
  cap: number;
}

/** Commits-only packs are tiny, so the depth can be generous. */
const DEPTH = 500;
/** Hard deadline for all network activity. */
const DEFAULT_TIMEOUT_MS = 20_000;

export interface AheadBehindOptions {
  /** Repository clone URLs, GRASP mirrors first (CORS-friendly). */
  cloneUrls: string[];
  /** Extra clone URLs from the PR / PR updates (https only). */
  extraCloneUrls?: string[];
  /** The ref carrying the tip: `refs/nostr/<pr-or-update-event-id>`. */
  tipRef: string;
  /** The tip commit id (`c` tag). */
  tipCommit: string;
  /** Target branch name (repo state HEAD); the remote's HEAD when absent. */
  targetRef?: string;
  /** Hard deadline for all network activity. */
  timeoutMs?: number;
  signal?: AbortSignal;
}

/** Walk the fetched graph from `start`; missing parents are the shallow edge. */
function reachable(graph: Map<string, string[]>, start: string): Set<string> {
  const seen = new Set<string>();
  const queue = [start];
  while (queue.length > 0) {
    const oid = queue.shift();
    if (!oid || seen.has(oid)) continue;
    const parents = graph.get(oid);
    if (!parents) continue;
    seen.add(oid);
    queue.push(...parents);
  }
  return seen;
}

export async function computeAheadBehind(options: AheadBehindOptions): Promise<AheadBehind> {
  const {
    cloneUrls,
    extraCloneUrls = [],
    tipRef,
    tipCommit,
    targetRef,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    signal,
  } = options;
  const unknown: AheadBehind = { ahead: null, behind: null, targetRef, cap: DEPTH };

  const deadline = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)])
    : AbortSignal.timeout(timeoutMs);

  for (const url of [...new Set([...cloneUrls, ...extraCloneUrls])]) {
    if (deadline.aborted) return unknown;
    try {
      const adv = await fetchRefAdvertisement(url, deadline);

      // Resolve the target branch head (named branch, else the remote HEAD).
      let resolvedTargetRef = targetRef;
      let targetOid = targetRef ? adv.refs.get(`refs/heads/${targetRef}`) : undefined;
      if (!targetOid) {
        targetOid = adv.refs.get('HEAD') ?? (adv.headSymref ? adv.refs.get(adv.headSymref) : undefined);
        resolvedTargetRef = adv.headSymref?.replace(/^refs\/heads\//, '') ?? targetRef;
      }
      if (!targetOid) continue;

      // The tip: prefer the advertised `refs/nostr/<id>` value; fall back to
      // the event's `c` tag (fetchable when the mirror advertises it — e.g.
      // as a branch — or when it's already in the target's history).
      const tipOid = adv.refs.get(tipRef) ?? tipCommit;

      const wants = [...new Set([targetOid, tipOid])].filter((oid) => {
        // Only `want` what the server advertises; un-advertised wants are
        // rejected. A tip that's merged is reachable from the target anyway.
        return oid === targetOid || [...adv.refs.values()].includes(oid);
      });

      const graph = await fetchCommitGraph({
        repoUrl: url,
        wants,
        depth: DEPTH,
        signal: deadline,
      });

      if (!graph.has(tipOid) || !graph.has(targetOid)) continue;

      const tipSet = reachable(graph, tipOid);
      const targetSet = reachable(graph, targetOid);

      // The histories must meet within the cap for the difference to be
      // meaningful (identical heads also count as "met").
      const intersects =
        tipOid === targetOid || [...tipSet].some((oid) => targetSet.has(oid));
      if (!intersects) return { ...unknown, targetRef: resolvedTargetRef };

      let ahead = 0;
      for (const oid of tipSet) if (!targetSet.has(oid)) ahead++;
      let behind = 0;
      for (const oid of targetSet) if (!tipSet.has(oid)) behind++;

      return { ahead, behind, targetRef: resolvedTargetRef, cap: DEPTH };
    } catch {
      // Deadline hit or mirror failure — try the next one.
      if (deadline.aborted) return unknown;
    }
  }

  return unknown;
}
