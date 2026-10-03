import { useQuery } from '@tanstack/react-query';

const GITHUB_BLOB_RE = /^https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/blob\/master\/([\w./-]+\.md)$/;
const GIT_SHA = /^[0-9a-f]{40}$/;

/**
 * The SHA of the latest `master` commit touching a GitHub-hosted spec file
 * (an official NIP or Blossom BUD blob URL). Forks record it so the exact
 * source text they started from can be diffed later.
 *
 * Best effort: the unauthenticated GitHub API is rate limited, so a failure
 * resolves to `null` and the fork is simply published without a pin.
 */
export function useGithubHeadCommit(blobUrl: string | undefined) {
  return useQuery<string | null>({
    queryKey: ['github-head-commit', blobUrl ?? ''],
    queryFn: async ({ signal }) => {
      const match = blobUrl?.match(GITHUB_BLOB_RE);
      if (!match) return null;
      const [, repo, path] = match;
      try {
        const response = await fetch(
          `https://api.github.com/repos/${repo}/commits?sha=master&per_page=1&path=${encodeURIComponent(path)}`,
          { signal: AbortSignal.any([signal, AbortSignal.timeout(6000)]) },
        );
        if (!response.ok) return null;
        const commits: unknown = await response.json();
        if (!Array.isArray(commits)) return null;
        const sha: unknown = (commits[0] as { sha?: unknown } | undefined)?.sha;
        return typeof sha === 'string' && GIT_SHA.test(sha) ? sha : null;
      } catch {
        return null;
      }
    },
    enabled: !!blobUrl,
    staleTime: 10 * 60 * 1000,
    retry: false,
  });
}
