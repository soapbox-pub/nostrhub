/**
 * Provision git repositories entirely in the browser and push them to a GRASP
 * server (a Nostr relay that doubles as a git smart-HTTP host).
 *
 * Everything runs against an in-memory filesystem (see `lib/memFs`) using
 * isomorphic-git. Authorization is implicit: the GRASP server provisions the
 * bare repo from the signed kind 30617 announcement (it trusts the `npub`
 * embedded in the clone URL path), so callers must **publish the announcement
 * first, then push** — mirroring how Shakespeare does it. To support that
 * ordering, preparation (init/clone + collecting refs) is split from the push.
 */

import { graspCloneUrl } from '@/lib/git';
import type { FsClient, HttpClient } from 'isomorphic-git';

const SEED_FILENAME = 'README.md';

/** How long to wait after announcing before pushing, so GRASP can provision. */
export const GRASP_PROVISION_DELAY_MS = 5000;

/** A repository staged in memory, ready to be pushed once announced. */
export interface PreparedRepo {
  /** Default branch name. */
  branch: string;
  /** Resolved refs: `refs/heads/<name>` → commit oid. */
  branches: Record<string, string>;
  /** Earliest reachable commit on the default branch (for the `euc` tag). */
  earliestCommit?: string;
  /**
   * Push every staged branch to the given GRASP server(s). Returns the clone
   * URLs that accepted the push. Throws if none did.
   */
  push: (graspServers: string[], pubkey: string, identifier: string) => Promise<PushResult>;
}

export interface PushResult {
  cloneUrls: string[];
  errors: string[];
}

function seedReadme(name: string, description?: string): string {
  const lines = [`# ${name}`];
  if (description?.trim()) lines.push('', description.trim());
  lines.push('', '_Created on NostrHub._', '');
  return lines.join('\n');
}

/** Lazy-load the heavy git machinery so it never lands in the main bundle. */
async function loadGit() {
  const [{ default: git }, { createMemFs }, { makeGitHttp }] = await Promise.all([
    import('isomorphic-git'),
    import('@/lib/memFs'),
    import('@/lib/gitHttp'),
  ]);
  return { git, createMemFs, makeGitHttp };
}

/** Build the push() closure shared by both prepare paths. Pushes go direct. */
function makePusher(
  git: typeof import('isomorphic-git').default,
  http: HttpClient,
  fs: FsClient,
  dir: string,
  branchNames: string[],
  signal?: AbortSignal,
) {
  return async (graspServers: string[], pubkey: string, identifier: string): Promise<PushResult> => {
    if (graspServers.length === 0) {
      throw new Error('Pick at least one GRASP server.');
    }
    const cloneUrls: string[] = [];
    const errors: string[] = [];
    for (const grasp of graspServers) {
      signal?.throwIfAborted();
      const url = graspCloneUrl(grasp, pubkey, identifier);
      try {
        for (const name of branchNames) {
          await git.push({ fs, http, dir, url, ref: `refs/heads/${name}`, remoteRef: `refs/heads/${name}` });
        }
        cloneUrls.push(url);
      } catch (err) {
        const host = new URL(grasp).host;
        errors.push(`${host}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    if (cloneUrls.length === 0) {
      throw new Error(`Could not push to any GRASP server.\n${errors.join('\n')}`);
    }
    return { cloneUrls, errors };
  };
}

export interface PrepareNewRepoOptions {
  name: string;
  description?: string;
  branch?: string;
  authorName?: string;
  signal?: AbortSignal;
}

/** Stage a brand-new repo (init + seed commit) for pushing after announcement. */
export async function prepareNewRepo(options: PrepareNewRepoOptions): Promise<PreparedRepo> {
  const { name, description, branch = 'main', authorName = 'NostrHub', signal } = options;
  const { git, createMemFs, makeGitHttp } = await loadGit();

  signal?.throwIfAborted();

  const memFs = createMemFs();
  const fs = memFs as unknown as FsClient;
  const dir = '/repo';

  await memFs.promises.mkdir(dir);
  await git.init({ fs, dir, defaultBranch: branch });
  await memFs.promises.writeFile(`${dir}/${SEED_FILENAME}`, seedReadme(name, description));
  await git.add({ fs, dir, filepath: SEED_FILENAME });

  const commit = await git.commit({
    fs,
    dir,
    message: 'Initial commit',
    author: { name: authorName, email: `${authorName}@nostrhub` },
  });

  return {
    branch,
    branches: { [`refs/heads/${branch}`]: commit },
    earliestCommit: commit,
    // GRASP hosts are CORS-enabled for writes, so push directly (no proxy).
    push: makePusher(git, makeGitHttp(), fs, dir, [branch], signal),
  };
}

export interface PrepareMirrorOptions {
  /** The source git URL to clone from (https smart-HTTP). */
  sourceUrl: string;
  /** CORS proxy template (`{href}`) for cloning from non-CORS hosts. */
  corsProxy?: string;
  signal?: AbortSignal;
}

/**
 * Clone an existing repository's objects into memory (all branches, full
 * history) and stage them for pushing to a GRASP server after announcement.
 */
export async function prepareMirror(options: PrepareMirrorOptions): Promise<PreparedRepo> {
  const { sourceUrl, corsProxy, signal } = options;
  const { git, createMemFs, makeGitHttp } = await loadGit();

  signal?.throwIfAborted();

  const memFs = createMemFs();
  const fs = memFs as unknown as FsClient;
  const dir = '/repo';
  await memFs.promises.mkdir(dir);

  // The source host usually lacks CORS, so route the clone through the proxy.
  await git.clone({
    fs,
    http: makeGitHttp(corsProxy ?? ''),
    dir,
    url: sourceUrl,
    singleBranch: false,
    noCheckout: true,
  });

  // Resolve the default branch from the cloned HEAD.
  let branch = 'main';
  try {
    const current = await git.currentBranch({ fs, dir, fullname: false });
    if (current) branch = current;
  } catch {
    // keep default
  }

  // Collect every local branch ref → commit oid.
  const branchNames = await git.listBranches({ fs, dir });
  const branches: Record<string, string> = {};
  for (const name of branchNames) {
    try {
      branches[`refs/heads/${name}`] = await git.resolveRef({ fs, dir, ref: `refs/heads/${name}` });
    } catch {
      // skip unresolvable refs
    }
  }
  if (Object.keys(branches).length === 0) {
    throw new Error('The source repository has no branches to mirror.');
  }
  if (!branches[`refs/heads/${branch}`]) {
    branch = branchNames[0] ?? branch;
  }

  // Earliest unique commit on the default branch, for the `euc` identity tag.
  let earliestCommit: string | undefined;
  try {
    const log = await git.log({ fs, dir, ref: `refs/heads/${branch}` });
    earliestCommit = log.at(-1)?.oid;
  } catch {
    // optional
  }

  return {
    branch,
    branches,
    earliestCommit,
    // GRASP pushes go direct (CORS-enabled); only the source clone is proxied.
    push: makePusher(git, makeGitHttp(), fs, dir, branchNames, signal),
  };
}

/** Build kind 30618 state tags from a set of branch refs. */
export function stateTagsFromBranches(
  identifier: string,
  headBranch: string,
  branches: Record<string, string>,
): string[][] {
  const tags: string[][] = [
    ['d', identifier],
    ['HEAD', `ref: refs/heads/${headBranch}`],
  ];
  for (const [ref, oid] of Object.entries(branches)) {
    tags.push([ref, oid]);
  }
  return tags;
}
