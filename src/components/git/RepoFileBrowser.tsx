import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Code2,
  Download,
  ExternalLink,
  File as FileIcon,
  FileText,
  Folder,
  FolderGit2,
  GitBranch,
  Link2,
  Loader2,
  ScrollText,
  Tag as TagIcon,
} from 'lucide-react';
import { MarkdownContent } from '@/components/MarkdownContent';
import { CopyButton } from '@/components/git/CopyButton';
import { CloneButton } from '@/components/git/CloneButton';
import { useRepoSnapshot, useRepoFile } from '@/hooks/useRepoSnapshot';
import { useToast } from '@/hooks/useToast';
import {
  findReadme,
  formatBytes,
  imageMimeType,
  looksBinary,
  type RepoSnapshot,
  type RepoTreeFile,
} from '@/lib/repoBrowser';
import type { GitRepoAnnouncement, GitRepoState } from '@/lib/git';
import { shortCommit } from '@/lib/git';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

const MAX_TEXT_BYTES = 1024 * 1024; // 1 MB
const MAX_RENDERED_LINES = 3000;

interface RepoFileBrowserProps {
  repo: GitRepoAnnouncement;
  state: GitRepoState | null;
}

/* ——— Tree helpers ——— */

/** Resolve a directory path (e.g. `src/lib`) to its child nodes in the tree. */
function nodesAtPath(tree: RepoTreeFile[], dir: string): RepoTreeFile[] | undefined {
  if (!dir) return tree;
  const segments = dir.split('/');
  let nodes: RepoTreeFile[] | undefined = tree;
  for (const segment of segments) {
    const next: RepoTreeFile | undefined = nodes?.find(
      (n) => n.type === 'dir' && n.name === segment,
    );
    if (!next) return undefined;
    nodes = next.children ?? [];
  }
  return nodes;
}

/** Collect every file path in the tree, for validating the URL selection. */
function collectFilePaths(tree: RepoTreeFile[]): Set<string> {
  const paths = new Set<string>();
  const walk = (nodes: RepoTreeFile[]) => {
    for (const node of nodes) {
      if (node.type === 'file') paths.add(node.path);
      else if (node.children) walk(node.children);
    }
  };
  walk(tree);
  return paths;
}

/** Find a README among a directory's immediate children. */
function findReadmeIn(nodes: RepoTreeFile[]): RepoTreeFile | undefined {
  return findReadme(nodes);
}

/* ——— Breadcrumb ——— */

function Breadcrumb({
  repoName,
  segments,
  onNavigate,
}: {
  repoName: string;
  segments: string[];
  onNavigate: (dir: string) => void;
}) {
  return (
    <nav aria-label="File path" className="flex flex-wrap items-center gap-1 text-sm">
      <button
        type="button"
        onClick={() => onNavigate('')}
        className={cn(
          'rounded font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          segments.length > 0 ? 'text-primary hover:underline' : 'text-foreground',
        )}
      >
        {repoName}
      </button>
      {segments.map((segment, i) => {
        const isLast = i === segments.length - 1;
        const dir = segments.slice(0, i + 1).join('/');
        return (
          <span key={dir} className="flex items-center gap-1">
            <span className="text-muted-foreground/50" aria-hidden="true">/</span>
            {isLast ? (
              <span className="font-semibold text-foreground">{segment}</span>
            ) : (
              <button
                type="button"
                onClick={() => onNavigate(dir)}
                className="rounded font-medium text-primary transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {segment}
              </button>
            )}
          </span>
        );
      })}
    </nav>
  );
}

/* ——— File / folder listing ——— */

function FileList({
  nodes,
  currentDir,
  onOpenDir,
  onOpenFile,
  nipAction,
}: {
  nodes: RepoTreeFile[];
  /** Current directory path (for the ".." up-row). */
  currentDir: string;
  onOpenDir: (path: string) => void;
  onOpenFile: (path: string) => void;
  /** Optional action rendered on a root-level NIP.md row. */
  nipAction?: React.ReactNode;
}) {
  const parentDir = currentDir.includes('/')
    ? currentDir.slice(0, currentDir.lastIndexOf('/'))
    : '';

  return (
    <ul className="divide-y divide-border/60">
      {currentDir && (
        <li>
          <button
            type="button"
            onClick={() => onOpenDir(parentDir)}
            className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          >
            <span className="size-4 shrink-0" aria-hidden="true" />
            <span className="font-mono">..</span>
          </button>
        </li>
      )}
      {nodes.map((node) => {
        const isDir = node.type === 'dir';
        const isNip = node.type === 'file' && node.path === 'NIP.md';
        return (
          <li key={node.path} className="flex items-center">
            <button
              type="button"
              onClick={() => (isDir ? onOpenDir(node.path) : onOpenFile(node.path))}
              className="flex min-w-0 flex-1 items-center gap-2.5 px-4 py-2 text-left text-sm transition-colors hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            >
              {isDir ? (
                <Folder className="size-4 shrink-0 text-chart-3" aria-hidden="true" />
              ) : (
                <FileIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              )}
              <span
                className={cn(
                  'min-w-0 truncate',
                  isDir ? 'font-medium text-foreground' : 'text-foreground/90 hover:text-primary',
                )}
              >
                {node.name}
              </span>
              {isDir && (
                <ChevronRight
                  className="ml-auto size-4 shrink-0 text-muted-foreground/40"
                  aria-hidden="true"
                />
              )}
            </button>
            {isNip && nipAction && <span className="shrink-0 pr-4">{nipAction}</span>}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * "Publish NIP" action for a root-level NIP.md: reads the file from the
 * snapshot and hands its markdown to the NIP editor, prefilled.
 */
function PublishNipButton({ snapshot, repo }: { snapshot: RepoSnapshot; repo: GitRepoAnnouncement }) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const handleClick = async () => {
    setBusy(true);
    try {
      const bytes = await snapshot.readFile('NIP.md');
      const text = new TextDecoder('utf-8').decode(bytes);
      const heading = text.split('\n').find((l) => l.startsWith('# '));
      const title = heading ? heading.replace(/^#\s+/, '').trim() : repo.name;
      navigate('/create', { state: { title, content: text } });
    } catch (err) {
      toast({
        title: "Couldn't read NIP.md",
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      aria-label="Publish NIP.md as a NIP"
      title="Publish this NIP.md as a NIP"
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary transition-colors',
        'hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50',
      )}
    >
      {busy ? (
        <Loader2 className="size-3 animate-spin" aria-hidden="true" />
      ) : (
        <ScrollText className="size-3" aria-hidden="true" />
      )}
      Publish NIP
    </button>
  );
}

/* ——— File viewer ——— */

function ImagePreview({ bytes, path }: { bytes: Uint8Array; path: string }) {
  const mime = imageMimeType(path);

  const url = useMemo(() => {
    if (!mime) return undefined;
    return URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: mime }));
  }, [bytes, mime]);

  useEffect(() => {
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [url]);

  if (!url) return null;
  return (
    <div className="flex justify-center p-6">
      <img
        src={url}
        alt={path}
        className="max-h-[28rem] max-w-full rounded-lg border border-border/60"
      />
    </div>
  );
}

function CodeView({ text }: { text: string }) {
  const allLines = text.split('\n');
  const lines = allLines.slice(0, MAX_RENDERED_LINES);
  const truncated = allLines.length > MAX_RENDERED_LINES;

  return (
    <div className="overflow-x-auto">
      <pre className="min-w-max p-4 text-[13px] leading-relaxed">
        <code className="font-mono">
          {lines.map((line, i) => (
            <div key={i} className="grid grid-cols-[3.25rem_1fr]">
              <span className="select-none pr-4 text-right text-muted-foreground/40" aria-hidden="true">
                {i + 1}
              </span>
              <span className="whitespace-pre">{line || ' '}</span>
            </div>
          ))}
        </code>
      </pre>
      {truncated && (
        <p className="border-t border-border/60 p-3 text-center text-xs text-muted-foreground">
          Showing the first {MAX_RENDERED_LINES.toLocaleString()} lines of{' '}
          {allLines.length.toLocaleString()}.
        </p>
      )}
    </div>
  );
}

function FileViewer({
  snapshot,
  path,
  shareUrl,
}: {
  snapshot: RepoSnapshot;
  path: string;
  /** Absolute, shareable URL that opens this file at the current branch. */
  shareUrl?: string;
}) {
  const { data: bytes, isLoading, isError } = useRepoFile(snapshot, path);
  const { toast } = useToast();
  const [copiedLink, setCopiedLink] = useState(false);
  const isMarkdown = /\.(md|markdown)$/i.test(path);
  const [rawPath, setRawPath] = useState<string | null>(null);
  const showRaw = rawPath === path;

  const text = useMemo(() => {
    if (!bytes || looksBinary(bytes) || bytes.length > MAX_TEXT_BYTES) return undefined;
    try {
      return new TextDecoder('utf-8').decode(bytes);
    } catch {
      return undefined;
    }
  }, [bytes]);

  const basename = path.slice(path.lastIndexOf('/') + 1);

  const toBlob = (forViewing: boolean) => {
    if (!bytes) return undefined;
    const mime = imageMimeType(path) ?? (forViewing && text !== undefined
      ? 'text/plain;charset=utf-8'
      : 'application/octet-stream');
    return new Blob([new Uint8Array(bytes)], { type: mime });
  };

  const openRaw = () => {
    const blob = toBlob(true);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const download = () => {
    const blob = toBlob(false);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = basename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 1500);
      toast({ title: 'Link to file copied to clipboard' });
    } catch {
      toast({ title: 'Could not copy link', variant: 'destructive' });
    }
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-border/60 bg-muted/40 px-4 py-2">
        <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="min-w-0 truncate font-mono text-[13px]" title={path}>
          {basename}
        </span>
        {bytes && (
          <span className="shrink-0 text-xs text-muted-foreground">{formatBytes(bytes.length)}</span>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-1">
          {shareUrl && (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={copyLink}
              aria-label={copiedLink ? 'Link copied' : `Copy link to ${path}`}
              title="Copy link to this file"
              className="text-muted-foreground hover:text-foreground"
            >
              {copiedLink ? (
                <Check className="size-3.5 text-chart-5" aria-hidden="true" />
              ) : (
                <Link2 className="size-3.5" aria-hidden="true" />
              )}
            </Button>
          )}
          {isMarkdown && text !== undefined && (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => setRawPath(showRaw ? null : path)}
              className="text-muted-foreground"
            >
              <Code2 className="size-3.5" aria-hidden="true" />
              {showRaw ? 'Rendered' : 'Raw'}
            </Button>
          )}
          {text !== undefined && <CopyButton value={text} label={`Copy contents of ${path}`} />}
          {bytes && (
            <>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={openRaw}
                aria-label={`View raw ${basename}`}
                title="View raw"
                className="text-muted-foreground hover:text-foreground"
              >
                <ExternalLink className="size-3.5" aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={download}
                aria-label={`Download ${basename}`}
                title="Download"
                className="text-muted-foreground hover:text-foreground"
              >
                <Download className="size-3.5" aria-hidden="true" />
              </Button>
            </>
          )}
        </span>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Reading file…
        </div>
      ) : isError || !bytes ? (
        <p className="p-10 text-center text-sm text-muted-foreground">Could not read this file.</p>
      ) : imageMimeType(path) ? (
        <ImagePreview bytes={bytes} path={path} />
      ) : text === undefined ? (
        <p className="p-10 text-center text-sm text-muted-foreground">
          Binary file ({formatBytes(bytes.length)}) — preview not available.
        </p>
      ) : isMarkdown && !showRaw ? (
        <div className="p-5 sm:p-6">
          <MarkdownContent content={text} />
        </div>
      ) : (
        <CodeView text={text} />
      )}
    </div>
  );
}

/* ——— Rendered README card ——— */

function ReadmeCard({ snapshot, path }: { snapshot: RepoSnapshot; path: string }) {
  const { data: bytes, isLoading } = useRepoFile(snapshot, path);
  const basename = path.slice(path.lastIndexOf('/') + 1);

  const text = useMemo(() => {
    if (!bytes || looksBinary(bytes) || bytes.length > MAX_TEXT_BYTES) return undefined;
    try {
      return new TextDecoder('utf-8').decode(bytes);
    } catch {
      return undefined;
    }
  }, [bytes]);

  const isMarkdown = /\.(md|markdown)$/i.test(path);

  if (isLoading) {
    return (
      <Card className="overflow-hidden">
        <div className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Loading README…
        </div>
      </Card>
    );
  }

  if (text === undefined) return null;

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border/60 bg-muted/40 px-4 py-2.5">
        <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="font-mono text-[13px] font-medium">{basename}</span>
      </div>
      <CardContent className="p-5 sm:p-6">
        {isMarkdown ? <MarkdownContent content={text} /> : <CodeView text={text} />}
      </CardContent>
    </Card>
  );
}

/* ——— Branch / tag toolbar ——— */

function BranchPicker({
  branch,
  branches,
  headBranch,
  onSelect,
}: {
  branch: string | undefined;
  branches: GitRepoState['branches'];
  headBranch: string | undefined;
  onSelect: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 max-w-48 gap-1.5 font-mono text-xs"
          aria-label="Switch branch"
        >
          <GitBranch className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="min-w-0 truncate font-semibold">{branch}</span>
          <ChevronDown className="size-3.5 shrink-0 opacity-60" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0">
        <Command>
          <CommandInput placeholder="Find a branch…" />
          <CommandList className="max-h-64">
            <CommandEmpty>No branches found.</CommandEmpty>
            <CommandGroup>
              {branches.map((b) => (
                <CommandItem
                  key={b.name}
                  value={b.name}
                  onSelect={(value) => {
                    onSelect(value);
                    setOpen(false);
                  }}
                  className="gap-2 font-mono text-xs"
                >
                  <span className="min-w-0 truncate">{b.name}</span>
                  {b.name === headBranch && (
                    <span className="shrink-0 rounded-full border border-border/60 px-1.5 py-px font-sans text-[10px] text-muted-foreground">
                      default
                    </span>
                  )}
                  {b.name === branch && (
                    <Check className="ml-auto size-3.5 shrink-0" aria-hidden="true" />
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/* ——— Browser ——— */

/**
 * In-browser file explorer for a NIP-34 repo: shallow-clones the packfile from
 * a GRASP mirror, then presents a GitHub-style directory listing (folders open
 * in place, files open in a viewer) with the README rendered below the root
 * listing. Branch, directory, and file are reflected in the URL so deep links
 * are shareable.
 */
export function RepoFileBrowser({ repo, state }: RepoFileBrowserProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const branches = state?.branches ?? [];
  const tags = state?.tags ?? [];

  const refParam = searchParams.get('ref') ?? undefined;
  const dirParam = searchParams.get('dir') ?? '';
  const pathParam = searchParams.get('path') ?? undefined;

  const branch =
    refParam && branches.some((b) => b.name === refParam)
      ? refParam
      : state?.headBranch ?? branches[0]?.name;

  const { data: snapshot, isLoading, isError, error } = useRepoSnapshot(repo, branch);

  /** Update search params, preserving the rest and replacing history. */
  const setParams = useCallback(
    (updates: Partial<Record<'ref' | 'dir' | 'path', string | undefined>>) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [key, value] of Object.entries(updates)) {
            if (value) next.set(key, value);
            else next.delete(key);
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const setBranch = useCallback(
    (value: string) => setParams({ ref: value, dir: undefined, path: undefined }),
    [setParams],
  );
  const openDir = useCallback(
    (dir: string) => setParams({ dir: dir || undefined, path: undefined }),
    [setParams],
  );
  const openFile = useCallback(
    (path: string) => setParams({ path }),
    [setParams],
  );

  const filePaths = useMemo(
    () => (snapshot ? collectFilePaths(snapshot.tree) : new Set<string>()),
    [snapshot],
  );

  // Selected file: the URL path when it still points at a real file.
  const selected = pathParam && filePaths.has(pathParam) ? pathParam : undefined;

  // Current directory listing (validated against the snapshot).
  const currentNodes = useMemo(() => {
    if (!snapshot) return undefined;
    return nodesAtPath(snapshot.tree, dirParam) ?? snapshot.tree;
  }, [snapshot, dirParam]);
  const currentDir = useMemo(() => {
    if (!snapshot) return '';
    return nodesAtPath(snapshot.tree, dirParam) ? dirParam : '';
  }, [snapshot, dirParam]);

  // README for the current directory listing (GitHub renders it below files).
  const readme = useMemo(
    () => (currentNodes ? findReadmeIn(currentNodes) : undefined),
    [currentNodes],
  );

  /** Absolute URL that re-opens the current view at the current branch. */
  const shareUrlFor = useCallback(
    (path: string) => {
      if (typeof window === 'undefined') return undefined;
      const params = new URLSearchParams();
      if (branch && branch !== state?.headBranch) params.set('ref', branch);
      params.set('path', path);
      return `${window.location.origin}${window.location.pathname}?${params.toString()}`;
    },
    [branch, state?.headBranch],
  );

  const hasMirrors = repo.cloneUrls.length > 0;
  const breadcrumbSegments = currentDir ? currentDir.split('/') : [];

  return (
    <div className="space-y-4">
      {/* ——— Toolbar: branch · tags · commit · Code ——— */}
      <div className="flex flex-wrap items-center gap-2">
        {branches.length > 0 ? (
          <BranchPicker
            branch={branch}
            branches={branches}
            headBranch={state?.headBranch}
            onSelect={setBranch}
          />
        ) : (
          <span className="flex items-center gap-2 text-sm font-semibold">
            <FolderGit2 className="size-4 text-primary" aria-hidden="true" /> Files
          </span>
        )}

        {tags.length > 0 && (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs text-muted-foreground">
                <TagIcon className="size-3.5" aria-hidden="true" />
                {tags.length} {tags.length === 1 ? 'tag' : 'tags'}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-64 p-0">
              <Command>
                <CommandInput placeholder="Find a tag…" />
                <CommandList className="max-h-64">
                  <CommandEmpty>No tags found.</CommandEmpty>
                  <CommandGroup>
                    {tags.map((tag) => (
                      <CommandItem key={tag.name} value={tag.name} className="gap-2 font-mono text-xs">
                        <span className="min-w-0 truncate">{tag.name}</span>
                        <code className="ml-auto shrink-0 text-muted-foreground" title={tag.commit}>
                          {shortCommit(tag.commit)}
                        </code>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        )}

        <div className="ml-auto flex items-center gap-2">
          {snapshot && (
            <code className="hidden font-mono text-xs text-muted-foreground sm:inline" title={snapshot.commit}>
              {shortCommit(snapshot.commit)}
            </code>
          )}
          <CloneButton repo={repo} />
        </div>
      </div>

      {/* ——— Body ——— */}
      {!hasMirrors ? (
        <Card>
          <p className="px-8 py-12 text-center text-sm text-muted-foreground">
            This repository doesn't list any clone mirrors, so its files can't be browsed here.
          </p>
        </Card>
      ) : isLoading ? (
        <Card>
          <div className="flex flex-col items-center gap-3 px-8 py-14 text-center">
            <span className="grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-primary/15 to-nebula/15 ring-1 ring-primary/20">
              <Loader2 className="size-5 animate-spin text-primary" aria-hidden="true" />
            </span>
            <p className="text-sm font-medium">Cloning over smart HTTP…</p>
            <p className="max-w-xs text-xs text-muted-foreground">
              Fetching a shallow packfile straight into your browser — no server in between.
            </p>
          </div>
        </Card>
      ) : isError || !snapshot ? (
        <Card>
          <div className="px-8 py-12 text-center">
            <p className="text-sm text-muted-foreground">
              Couldn't fetch this repository's files from any mirror.
            </p>
            {error instanceof Error && (
              <pre className="mx-auto mt-3 max-w-xl overflow-x-auto whitespace-pre-wrap text-left font-mono text-xs text-muted-foreground/70">
                {error.message}
              </pre>
            )}
          </div>
        </Card>
      ) : snapshot.tree.length === 0 ? (
        <Card>
          <p className="px-8 py-12 text-center text-sm text-muted-foreground">
            This repository is empty.
          </p>
        </Card>
      ) : selected ? (
        /* ——— Single file view ——— */
        <>
          <Breadcrumb
            repoName={repo.name}
            segments={selected.split('/')}
            onNavigate={(dir) => openDir(dir)}
          />
          <Card className="overflow-hidden">
            <FileViewer snapshot={snapshot} path={selected} shareUrl={shareUrlFor(selected)} />
          </Card>
        </>
      ) : (
        /* ——— Directory listing + README ——— */
        <>
          {breadcrumbSegments.length > 0 && (
            <Breadcrumb
              repoName={repo.name}
              segments={breadcrumbSegments}
              onNavigate={(dir) => openDir(dir)}
            />
          )}
          <Card className="overflow-hidden py-0">
            <FileList
              nodes={currentNodes ?? []}
              currentDir={currentDir}
              onOpenDir={openDir}
              onOpenFile={openFile}
              nipAction={
                currentDir === '' && (currentNodes ?? []).some((n) => n.path === 'NIP.md') ? (
                  <PublishNipButton snapshot={snapshot} repo={repo} />
                ) : undefined
              }
            />
          </Card>
          {readme && <ReadmeCard snapshot={snapshot} path={readme.path} />}
        </>
      )}
    </div>
  );
}

export default RepoFileBrowser;
