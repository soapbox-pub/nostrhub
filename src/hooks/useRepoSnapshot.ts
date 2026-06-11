import { useQuery } from '@tanstack/react-query';
import { cloneRepoSnapshot, type RepoSnapshot } from '@/lib/repoBrowser';
import type { GitRepoAnnouncement } from '@/lib/git';

/**
 * Shallow-clone a repository in the browser and expose its file tree.
 *
 * GRASP mirrors are tried first (they serve CORS-enabled git smart-HTTP);
 * other mirrors may be unreachable from the browser and fail gracefully.
 * The snapshot is cached per (repo, branch) and never refetched while mounted.
 */
export function useRepoSnapshot(repo: GitRepoAnnouncement | null, ref?: string) {
  return useQuery<RepoSnapshot>({
    queryKey: ['repo-snapshot', repo?.pubkey ?? '', repo?.identifier ?? '', ref ?? ''],
    queryFn: async ({ signal }) => {
      if (!repo) throw new Error('No repository');

      // GRASP mirrors first: they are CORS-friendly by design.
      const cloneUrls = [...repo.cloneUrls].sort((a, b) => {
        const aGrasp = repo.graspServers.includes(new URL(a).hostname) ? 0 : 1;
        const bGrasp = repo.graspServers.includes(new URL(b).hostname) ? 0 : 1;
        return aGrasp - bGrasp;
      });

      return cloneRepoSnapshot({ cloneUrls, ref, signal });
    },
    enabled: Boolean(repo && repo.cloneUrls.length > 0),
    staleTime: Infinity,
    gcTime: 10 * 60 * 1000,
    retry: false,
  });
}

/** Read a single file from a repo snapshot. */
export function useRepoFile(snapshot: RepoSnapshot | undefined, path: string | undefined) {
  return useQuery<Uint8Array>({
    queryKey: ['repo-file', snapshot?.commit ?? '', path ?? ''],
    queryFn: async () => {
      if (!snapshot || !path) throw new Error('No file selected');
      return snapshot.readFile(path);
    },
    enabled: Boolean(snapshot && path),
    staleTime: Infinity,
    gcTime: 5 * 60 * 1000,
    retry: false,
  });
}
