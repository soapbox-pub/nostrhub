/**
 * In-browser repository browsing for NIP-34 git repos.
 *
 * Performs a shallow, no-checkout `git clone` into an in-memory filesystem
 * (memfs) using isomorphic-git, then reads trees and blobs directly from the
 * object store. The network cost is a single depth-1 packfile; nothing is
 * written to a worktree and nothing persists across page loads.
 *
 * GRASP servers (Nostr relays that double as git smart-HTTP hosts) serve
 * CORS-enabled git endpoints, so they are tried first. Other mirrors (e.g.
 * GitHub) typically reject cross-origin smart-HTTP requests and will fail
 * gracefully.
 */

export interface RepoTreeFile {
  /** Path relative to the repo root, e.g. `src/lib/git.ts`. */
  path: string;
  /** Basename, e.g. `git.ts`. */
  name: string;
  type: 'file' | 'dir';
  /** Children for directories, sorted dirs-first then alphabetical. */
  children?: RepoTreeFile[];
}

export interface RepoSnapshot {
  /** Root entries of the repository tree. */
  tree: RepoTreeFile[];
  /** Total number of files (not directories). */
  fileCount: number;
  /** The commit id the snapshot points at. */
  commit: string;
  /** Hostname of the mirror the packfile was fetched from. */
  mirror: string;
  /** Read a file's raw bytes by repo-relative path. */
  readFile: (path: string) => Promise<Uint8Array>;
}

function sortTree(nodes: RepoTreeFile[]): RepoTreeFile[] {
  nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  for (const node of nodes) {
    if (node.children) sortTree(node.children);
  }
  return nodes;
}

export interface CloneSnapshotOptions {
  /** Clone URLs to try, in order. */
  cloneUrls: string[];
  /** Branch to check out; omit to use the remote default (HEAD). */
  ref?: string;
  /** CORS proxy template (`{href}`) for cloning from non-CORS hosts. */
  corsProxy?: string;
  signal?: AbortSignal;
}

/**
 * Build a snapshot the cheap way: a `filter blob:none` partial fetch that
 * transfers only the commit + tree objects (a few hundred KB even for huge
 * repositories), with file contents lazily fetched one blob at a time when
 * read. Requires the server to advertise the `filter` capability — GRASP
 * servers do.
 */
async function partialSnapshot(
  url: string,
  ref: string | undefined,
  signal?: AbortSignal,
): Promise<RepoSnapshot> {
  const { fetchRefAdvertisement, fetchPackObjects, commitTreeOid, parseTree } = await import(
    '@/lib/gitCommitFetch'
  );

  const adv = await fetchRefAdvertisement(url, signal);
  if (!adv.caps.has('filter')) throw new Error('server does not support partial fetch');

  const headOid = ref
    ? (adv.refs.get(`refs/heads/${ref}`) ??
      adv.refs.get(`refs/tags/${ref}`) ??
      adv.refs.get(ref))
    : (adv.refs.get('HEAD') ?? (adv.headSymref ? adv.refs.get(adv.headSymref) : undefined));
  if (!headOid) throw new Error(`ref not found: ${ref ?? 'HEAD'}`);

  const objects = await fetchPackObjects({
    repoUrl: url,
    wants: [headOid],
    depth: 1,
    filter: 'blob:none',
    signal,
  });

  const commitObj = objects.get(headOid);
  if (commitObj?.type !== 'commit') throw new Error('head commit missing from pack');
  const rootTree = commitTreeOid(commitObj.data);
  if (!rootTree) throw new Error('commit has no tree');

  // Walk the tree objects to build the hierarchy + a path → blob-oid index.
  const root: RepoTreeFile[] = [];
  const blobOids = new Map<string, string>();
  let fileCount = 0;

  const walk = (treeOid: string, basePath: string, into: RepoTreeFile[]) => {
    const tree = objects.get(treeOid);
    if (tree?.type !== 'tree') return;
    for (const entry of parseTree(tree.data)) {
      const path = basePath ? `${basePath}/${entry.name}` : entry.name;
      if (entry.mode === '40000' || entry.mode === '040000') {
        const children: RepoTreeFile[] = [];
        into.push({ path, name: entry.name, type: 'dir', children });
        walk(entry.oid, path, children);
      } else if (entry.mode !== '160000') {
        // Blobs and symlinks; submodules ('160000') are skipped.
        into.push({ path, name: entry.name, type: 'file' });
        blobOids.set(path, entry.oid);
        fileCount++;
      }
    }
  };
  walk(rootTree, '', root);

  // Lazy per-file blob fetch (the server allows want-by-blob-id for partial
  // clones), cached per snapshot.
  const blobCache = new Map<string, Uint8Array>();
  const readFile = async (filepath: string): Promise<Uint8Array> => {
    const oid = blobOids.get(filepath);
    if (!oid) throw new Error(`No such file: ${filepath}`);
    const cached = blobCache.get(oid);
    if (cached) return cached;
    const fetched = await fetchPackObjects({ repoUrl: url, wants: [oid] });
    const blob = fetched.get(oid);
    if (blob?.type !== 'blob') throw new Error(`Could not fetch ${filepath}`);
    blobCache.set(oid, blob.data);
    return blob.data;
  };

  return {
    tree: sortTree(root),
    fileCount,
    commit: headOid,
    mirror: new URL(url).hostname,
    readFile,
  };
}

/**
 * Fetch the repository metadata and return a snapshot for browsing. Tries
 * each clone URL in order: first a cheap commits+trees partial fetch, then a
 * full isomorphic-git shallow clone for servers without `filter` support.
 */
export async function cloneRepoSnapshot(options: CloneSnapshotOptions): Promise<RepoSnapshot> {
  const { cloneUrls, ref, corsProxy, signal } = options;
  if (cloneUrls.length === 0) {
    throw new Error('This repository has no clone URLs to browse.');
  }

  const errors: string[] = [];

  // Pass 1: partial fetch (tiny — no blobs are transferred up front).
  for (const url of cloneUrls) {
    signal?.throwIfAborted();
    try {
      return await partialSnapshot(url, ref, signal);
    } catch (err) {
      errors.push(
        `${new URL(url).hostname}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // Pass 2: full shallow clone via isomorphic-git (downloads all blobs).
  // Lazy-load the heavy git machinery so it never lands in the main bundle.
  const [{ default: git }, { createMemFs }, { makeGitHttp }] = await Promise.all([
    import('isomorphic-git'),
    import('@/lib/memFs'),
    import('@/lib/gitHttp'),
  ]);

  const http = makeGitHttp(corsProxy ?? '', signal);

  for (const url of cloneUrls) {
    signal?.throwIfAborted();

    // A fresh zero-dependency in-memory fs per attempt; isomorphic-git's
    // declared fs type differs slightly from our structural implementation.
    const fs = createMemFs() as unknown as Parameters<typeof git.clone>[0]['fs'];
    const dir = '/repo';
    const hostname = new URL(url).hostname;

    try {
      await git.clone({
        fs,
        http,
        dir,
        url,
        ref,
        singleBranch: true,
        depth: 1,
        noCheckout: true,
        noTags: true,
      });

      const commit = await git.resolveRef({ fs, dir, ref: ref ?? 'HEAD' });

      // Walk the commit's tree recursively to build the file hierarchy.
      const root: RepoTreeFile[] = [];
      let fileCount = 0;

      const walk = async (treeOid: string, basePath: string, into: RepoTreeFile[]) => {
        const { tree } = await git.readTree({ fs, dir, oid: treeOid });
        for (const entry of tree) {
          const path = basePath ? `${basePath}/${entry.path}` : entry.path;
          if (entry.type === 'tree') {
            const children: RepoTreeFile[] = [];
            into.push({ path, name: entry.path, type: 'dir', children });
            await walk(entry.oid, path, children);
          } else if (entry.type === 'blob') {
            into.push({ path, name: entry.path, type: 'file' });
            fileCount++;
          }
          // Submodules ('commit' entries) are skipped.
        }
      };

      const { commit: commitObj } = await git.readCommit({ fs, dir, oid: commit });
      await walk(commitObj.tree, '', root);

      const readFile = async (filepath: string): Promise<Uint8Array> => {
        const { blob } = await git.readBlob({ fs, dir, oid: commit, filepath });
        return blob;
      };

      return { tree: sortTree(root), fileCount, commit, mirror: hostname, readFile };
    } catch (err) {
      errors.push(`${hostname}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  throw new Error(`Could not fetch the repository from any mirror.\n${errors.join('\n')}`);
}

/** Locate the repo's README at the root of the tree, if present. */
export function findReadme(tree: RepoTreeFile[]): RepoTreeFile | undefined {
  const candidates = tree.filter(
    (node) => node.type === 'file' && /^readme(\.(md|markdown|txt))?$/i.test(node.name),
  );
  // Prefer markdown variants.
  return candidates.find((c) => /\.(md|markdown)$/i.test(c.name)) ?? candidates[0];
}

/** True if the buffer looks like binary data (contains a NUL byte early on). */
export function looksBinary(bytes: Uint8Array): boolean {
  const len = Math.min(bytes.length, 8000);
  for (let i = 0; i < len; i++) {
    if (bytes[i] === 0) return true;
  }
  return false;
}

const IMAGE_EXTENSIONS: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
  avif: 'image/avif',
};

/** MIME type for image files we can preview inline, by extension. */
export function imageMimeType(path: string): string | undefined {
  const ext = path.split('.').pop()?.toLowerCase();
  return ext ? IMAGE_EXTENSIONS[ext] : undefined;
}

/** Human-readable byte size. */
export function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
