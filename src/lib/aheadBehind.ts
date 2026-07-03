/**
 * Compute how many commits a PR tip is ahead of / behind the target branch,
 * GitHub-style, entirely in the browser.
 *
 * Strategy: shallow-fetch (depth-capped) the target branch and the PR tip ref
 * (`refs/nostr/<event-id>`, which NIP-34 says the tip is pushed to on GRASP
 * servers) into one in-memory object store, then walk both commit graphs and
 * take set differences:
 *
 *   ahead  = |reachable(tip)    \ reachable(target)|
 *   behind = |reachable(target) \ reachable(tip)|
 *
 * The walks are capped; when the two histories don't meet within the cap the
 * counts are unknowable from the fetched data and `null` is returned.
 */

export interface AheadBehind {
  /** Commits on the PR tip that aren't on the target branch (null = unknown). */
  ahead: number | null;
  /** Commits on the target branch that aren't on the PR tip (null = unknown). */
  behind: number | null;
  /** The branch compared against, e.g. `main`. */
  targetRef?: string;
  /** The walk/fetch depth cap. */
  cap: number;
}

const CAP = 200;

export interface AheadBehindOptions {
  /** Repository clone URLs, GRASP mirrors first (CORS-friendly). */
  cloneUrls: string[];
  /** Extra clone URLs from the PR / PR updates (https only). */
  extraCloneUrls?: string[];
  /** The ref carrying the tip: `refs/nostr/<pr-or-update-event-id>`. */
  tipRef: string;
  /** The tip commit id (`c` tag). */
  tipCommit: string;
  /** Target branch name (repo state HEAD); candidates are tried when absent. */
  targetRef?: string;
  signal?: AbortSignal;
}

export async function computeAheadBehind(options: AheadBehindOptions): Promise<AheadBehind> {
  const { cloneUrls, extraCloneUrls = [], tipRef, tipCommit, targetRef, signal } = options;

  // Lazy-load the git machinery so it stays out of the main bundle.
  const [{ default: git }, { createMemFs }, { makeGitHttp }] = await Promise.all([
    import('isomorphic-git'),
    import('@/lib/memFs'),
    import('@/lib/gitHttp'),
  ]);

  const fs = createMemFs() as unknown as Parameters<typeof git.init>[0]['fs'];
  const dir = '/ab';
  const http = makeGitHttp('');
  await git.init({ fs, dir });

  /** Fetch one ref (depth-capped) from the first URL that serves it. */
  const fetchRef = async (urls: string[], ref: string): Promise<string | undefined> => {
    for (const url of urls) {
      signal?.throwIfAborted();
      try {
        // isomorphic-git requires a configured refspec for the remote.
        await git.addRemote({ fs, dir, remote: 'origin', url, force: true });
        const result = await git.fetch({
          fs,
          http,
          dir,
          url,
          ref,
          depth: CAP,
          singleBranch: true,
          tags: false,
        });
        if (result.fetchHead) return result.fetchHead;
      } catch {
        // Try the next mirror.
      }
    }
    return undefined;
  };

  // 1) Target branch head.
  let resolvedTargetRef: string | undefined;
  let targetHead: string | undefined;
  for (const candidate of [...new Set([targetRef, 'HEAD', 'main', 'master'])].filter(
    (r): r is string => Boolean(r),
  )) {
    targetHead = await fetchRef(cloneUrls, candidate);
    if (targetHead) {
      resolvedTargetRef = candidate === 'HEAD' ? undefined : candidate;
      break;
    }
  }
  if (!targetHead) return { ahead: null, behind: null, targetRef, cap: CAP };

  /** True when the commit object is present in the local store. */
  const hasCommit = async (oid: string): Promise<boolean> => {
    try {
      await git.readCommit({ fs, dir, oid });
      return true;
    } catch {
      return false;
    }
  };

  // 2) The PR tip. The target fetch may already contain it (e.g. merged PRs);
  //    otherwise pull `refs/nostr/<id>` from the repo mirrors, then from the
  //    PR's own clone URLs.
  if (!(await hasCommit(tipCommit))) {
    await fetchRef(cloneUrls, tipRef);
  }
  if (!(await hasCommit(tipCommit))) {
    await fetchRef(extraCloneUrls, tipRef);
  }
  if (!(await hasCommit(tipCommit))) {
    return { ahead: null, behind: null, targetRef: resolvedTargetRef, cap: CAP };
  }

  // 3) Walk both graphs (BFS over parents, tolerant of shallow boundaries).
  const walk = async (start: string): Promise<Set<string>> => {
    const seen = new Set<string>();
    const queue = [start];
    while (queue.length > 0 && seen.size < CAP) {
      const oid = queue.shift();
      if (!oid || seen.has(oid)) continue;
      try {
        const { commit } = await git.readCommit({ fs, dir, oid });
        seen.add(oid);
        queue.push(...commit.parent);
      } catch {
        // Shallow boundary — stop this branch of the walk.
      }
    }
    return seen;
  };

  const [tipSet, targetSet] = await Promise.all([walk(tipCommit), walk(targetHead)]);

  // The histories must meet within the cap for the difference to be meaningful
  // (identical heads also count as "met").
  const intersects =
    tipCommit === targetHead || [...tipSet].some((oid) => targetSet.has(oid));
  if (!intersects) {
    return { ahead: null, behind: null, targetRef: resolvedTargetRef, cap: CAP };
  }

  let ahead = 0;
  for (const oid of tipSet) if (!targetSet.has(oid)) ahead++;
  let behind = 0;
  for (const oid of targetSet) if (!tipSet.has(oid)) behind++;

  return { ahead, behind, targetRef: resolvedTargetRef, cap: CAP };
}
