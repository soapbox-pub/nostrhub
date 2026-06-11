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
  signal?: AbortSignal;
}

/**
 * Shallow-clone the repository metadata and return a snapshot for browsing.
 * Tries each clone URL in order until one succeeds.
 */
export async function cloneRepoSnapshot(options: CloneSnapshotOptions): Promise<RepoSnapshot> {
  const { cloneUrls, ref, signal } = options;
  if (cloneUrls.length === 0) {
    throw new Error('This repository has no clone URLs to browse.');
  }

  // Lazy-load the heavy git machinery so it never lands in the main bundle.
  const [{ default: git }, { default: http }, { Volume, createFsFromVolume }] = await Promise.all([
    import('isomorphic-git'),
    import('isomorphic-git/http/web'),
    import('memfs'),
  ]);

  const errors: string[] = [];

  for (const url of cloneUrls) {
    signal?.throwIfAborted();

    const vol = new Volume();
    // memfs is structurally compatible with the fs interface isomorphic-git
    // expects, but their type declarations differ slightly.
    const fs = createFsFromVolume(vol) as unknown as Parameters<typeof git.clone>[0]['fs'];
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
