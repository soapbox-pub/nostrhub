/**
 * Minimal in-memory filesystem for isomorphic-git, with zero Node builtins.
 *
 * memfs and friends pull in `node:buffer` / `node:crypto` / `node:stream`,
 * which Vite externalizes to empty modules in the browser. isomorphic-git
 * only needs a small promise-based fs surface, so we implement it directly
 * on top of Maps. Paths are normalized to absolute POSIX form.
 *
 * isomorphic-git's FileSystem wrapper drives this via error `code`s:
 * `ENOENT` (missing), `EEXIST` (mkdir on existing), `ENOTEMPTY` (rmdir).
 */

interface FsError extends Error {
  code: string;
}

function fsError(code: string, path: string, syscall: string): FsError {
  const err = new Error(`${code}: ${syscall} '${path}'`) as FsError;
  err.code = code;
  return err;
}

export interface MemFsStats {
  type: 'file' | 'dir' | 'symlink';
  mode: number;
  size: number;
  ino: number;
  mtimeMs: number;
  ctimeMs: number;
  uid: number;
  gid: number;
  dev: number;
  isFile(): boolean;
  isDirectory(): boolean;
  isSymbolicLink(): boolean;
}

type WriteData = string | Uint8Array;
type ReadOptions = string | { encoding?: string } | undefined;

export interface MemFsPromises {
  readFile(path: string, options?: ReadOptions): Promise<Uint8Array | string>;
  writeFile(path: string, data: WriteData, options?: unknown): Promise<void>;
  unlink(path: string): Promise<void>;
  readdir(path: string): Promise<string[]>;
  mkdir(path: string, options?: unknown): Promise<void>;
  rmdir(path: string): Promise<void>;
  stat(path: string): Promise<MemFsStats>;
  lstat(path: string): Promise<MemFsStats>;
  readlink(path: string): Promise<string>;
  symlink(target: string, path: string): Promise<void>;
  chmod(path: string, mode: number): Promise<void>;
}

export interface MemFs {
  promises: MemFsPromises;
}

function normalize(path: string): string {
  const segments = path.split('/').filter((s) => s !== '' && s !== '.');
  const out: string[] = [];
  for (const segment of segments) {
    if (segment === '..') out.pop();
    else out.push(segment);
  }
  return '/' + out.join('/');
}

function parentOf(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx <= 0 ? '/' : path.slice(0, idx);
}

function basenameOf(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

/** Create an empty in-memory filesystem compatible with isomorphic-git. */
export function createMemFs(): MemFs {
  const files = new Map<string, Uint8Array>();
  const symlinks = new Map<string, string>();
  const dirs = new Set<string>(['/']);
  const mtimes = new Map<string, number>();

  const exists = (path: string) =>
    files.has(path) || symlinks.has(path) || dirs.has(path);

  const touch = (path: string) => mtimes.set(path, Date.now());

  const makeStats = (path: string): MemFsStats => {
    let type: MemFsStats['type'];
    let size = 0;
    let mode: number;
    if (files.has(path)) {
      type = 'file';
      size = files.get(path)!.length;
      mode = 0o100644;
    } else if (symlinks.has(path)) {
      type = 'symlink';
      size = symlinks.get(path)!.length;
      mode = 0o120000;
    } else if (dirs.has(path)) {
      type = 'dir';
      mode = 0o40000;
    } else {
      throw fsError('ENOENT', path, 'stat');
    }
    const mtimeMs = mtimes.get(path) ?? 0;
    return {
      type,
      mode,
      size,
      ino: 0,
      mtimeMs,
      ctimeMs: mtimeMs,
      uid: 1,
      gid: 1,
      dev: 1,
      isFile: () => type === 'file',
      isDirectory: () => type === 'dir',
      isSymbolicLink: () => type === 'symlink',
    };
  };

  const promises: MemFsPromises = {
    async readFile(rawPath, options) {
      const path = normalize(rawPath);
      const data = files.get(path);
      if (data === undefined) throw fsError('ENOENT', path, 'open');
      const encoding = typeof options === 'string' ? options : options?.encoding;
      if (encoding === 'utf8' || encoding === 'utf-8') {
        return new TextDecoder().decode(data);
      }
      return data;
    },

    async writeFile(rawPath, data) {
      const path = normalize(rawPath);
      if (dirs.has(path)) throw fsError('EISDIR', path, 'open');
      if (!dirs.has(parentOf(path))) throw fsError('ENOENT', path, 'open');
      files.set(path, typeof data === 'string' ? new TextEncoder().encode(data) : data);
      symlinks.delete(path);
      touch(path);
    },

    async unlink(rawPath) {
      const path = normalize(rawPath);
      if (!files.delete(path) && !symlinks.delete(path)) {
        throw fsError('ENOENT', path, 'unlink');
      }
      mtimes.delete(path);
    },

    async readdir(rawPath) {
      const path = normalize(rawPath);
      if (!dirs.has(path)) {
        throw fsError(exists(path) ? 'ENOTDIR' : 'ENOENT', path, 'scandir');
      }
      const prefix = path === '/' ? '/' : `${path}/`;
      const names = new Set<string>();
      for (const candidate of [...files.keys(), ...symlinks.keys(), ...dirs]) {
        if (candidate !== path && candidate.startsWith(prefix)) {
          const rest = candidate.slice(prefix.length);
          if (!rest.includes('/')) names.add(basenameOf(candidate));
        }
      }
      return [...names].sort();
    },

    async mkdir(rawPath) {
      const path = normalize(rawPath);
      if (exists(path)) throw fsError('EEXIST', path, 'mkdir');
      if (!dirs.has(parentOf(path))) throw fsError('ENOENT', path, 'mkdir');
      dirs.add(path);
      touch(path);
    },

    async rmdir(rawPath) {
      const path = normalize(rawPath);
      if (!dirs.has(path)) {
        throw fsError(exists(path) ? 'ENOTDIR' : 'ENOENT', path, 'rmdir');
      }
      if ((await promises.readdir(path)).length > 0) {
        throw fsError('ENOTEMPTY', path, 'rmdir');
      }
      dirs.delete(path);
      mtimes.delete(path);
    },

    async stat(rawPath) {
      return makeStats(normalize(rawPath));
    },

    async lstat(rawPath) {
      return makeStats(normalize(rawPath));
    },

    async readlink(rawPath) {
      const path = normalize(rawPath);
      const target = symlinks.get(path);
      if (target === undefined) throw fsError('ENOENT', path, 'readlink');
      return target;
    },

    async symlink(target, rawPath) {
      const path = normalize(rawPath);
      if (exists(path)) throw fsError('EEXIST', path, 'symlink');
      symlinks.set(path, target);
      touch(path);
    },

    async chmod() {
      // Permissions are meaningless in-memory; accept and ignore.
    },
  };

  return { promises };
}
