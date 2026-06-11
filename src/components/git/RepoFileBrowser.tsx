import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Code2,
  Download,
  ExternalLink,
  FileCode2,
  FileText,
  Folder,
  FolderGit2,
  FolderOpen,
  GitBranch,
  Loader2,
  Tag as TagIcon,
} from 'lucide-react';
import { MarkdownContent } from '@/components/MarkdownContent';
import { CopyButton } from '@/components/git/CopyButton';
import { CloneButton } from '@/components/git/CloneButton';
import { useRepoSnapshot, useRepoFile } from '@/hooks/useRepoSnapshot';
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

/* ——— Tree ——— */

function TreeRow({
  node,
  depth,
  expanded,
  selected,
  onToggle,
  onSelect,
}: {
  node: RepoTreeFile;
  depth: number;
  expanded: Set<string>;
  selected: string | undefined;
  onToggle: (path: string) => void;
  onSelect: (path: string) => void;
}) {
  const isDir = node.type === 'dir';
  const isOpen = isDir && expanded.has(node.path);
  const isSelected = node.path === selected;

  return (
    <>
      <button
        type="button"
        onClick={() => (isDir ? onToggle(node.path) : onSelect(node.path))}
        className={cn(
          'flex w-full items-center gap-1.5 rounded-md py-1 pr-2 text-left text-sm transition-colors',
          'hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          isSelected ? 'bg-gradient-to-r from-primary/15 to-nebula/10 font-medium' : 'text-muted-foreground hover:text-foreground',
        )}
        style={{ paddingLeft: `${depth * 14 + 8}px` }}
        aria-expanded={isDir ? isOpen : undefined}
        aria-current={isSelected ? 'true' : undefined}
      >
        {isDir ? (
          <>
            {isOpen ? (
              <ChevronDown className="size-3.5 shrink-0 opacity-60" aria-hidden="true" />
            ) : (
              <ChevronRight className="size-3.5 shrink-0 opacity-60" aria-hidden="true" />
            )}
            {isOpen ? (
              <FolderOpen className="size-4 shrink-0 text-chart-3" aria-hidden="true" />
            ) : (
              <Folder className="size-4 shrink-0 text-chart-3" aria-hidden="true" />
            )}
          </>
        ) : (
          <>
            <span className="size-3.5 shrink-0" aria-hidden="true" />
            <FileCode2 className="size-4 shrink-0 opacity-70" aria-hidden="true" />
          </>
        )}
        <span className="min-w-0 truncate font-mono text-[13px]">{node.name}</span>
      </button>
      {isDir && isOpen && node.children?.map((child) => (
        <TreeRow
          key={child.path}
          node={child}
          depth={depth + 1}
          expanded={expanded}
          selected={selected}
          onToggle={onToggle}
          onSelect={onSelect}
        />
      ))}
    </>
  );
}

/* ——— File viewer ——— */

function ImagePreview({ bytes, path }: { bytes: Uint8Array; path: string }) {
  const mime = imageMimeType(path);

  // Create the object URL during render (memoized) and only revoke it from
  // the effect cleanup, keeping setState out of effects.
  const url = useMemo(() => {
    if (!mime) return undefined;
    // Copy into a fresh ArrayBuffer-backed view to satisfy BlobPart typing.
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

function FileViewer({ snapshot, path }: { snapshot: RepoSnapshot; path: string }) {
  const { data: bytes, isLoading, isError } = useRepoFile(snapshot, path);
  const isMarkdown = /\.(md|markdown)$/i.test(path);
  // Track which path raw-mode is enabled for, so navigating away auto-resets.
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

  /** Build a Blob of the file's bytes with a sensible MIME type. */
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
    // Give the new tab time to load the blob before releasing it.
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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-border/60 bg-muted/40 px-4 py-2">
        <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="min-w-0 truncate font-mono text-[13px]" title={path}>
          {path}
        </span>
        {bytes && (
          <span className="shrink-0 text-xs text-muted-foreground">{formatBytes(bytes.length)}</span>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-1">
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

/* ——— Browser ——— */

/**
 * In-browser file explorer for a NIP-34 repo: shallow-clones the packfile
 * from a GRASP mirror and renders the tree + file contents, README first.
 */
export function RepoFileBrowser({ repo, state }: RepoFileBrowserProps) {
  const branches = state?.branches ?? [];
  const tags = state?.tags ?? [];
  const [branch, setBranch] = useState<string | undefined>(state?.headBranch ?? branches[0]?.name);
  const [branchOpen, setBranchOpen] = useState(false);
  const { data: snapshot, isLoading, isError, error } = useRepoSnapshot(repo, branch);

  const [selectedPath, setSelectedPath] = useState<string>();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // All file paths in the current snapshot, for validating the selection
  // (a branch switch can produce a tree without the previously-open file).
  const filePaths = useMemo(() => {
    const paths = new Set<string>();
    const collect = (nodes: RepoTreeFile[]) => {
      for (const node of nodes) {
        if (node.type === 'file') paths.add(node.path);
        else if (node.children) collect(node.children);
      }
    };
    if (snapshot) collect(snapshot.tree);
    return paths;
  }, [snapshot]);

  // Derived selection: the user's pick when still valid, else the README.
  const defaultPath = useMemo(() => {
    if (!snapshot) return undefined;
    return findReadme(snapshot.tree)?.path ?? snapshot.tree.find((n) => n.type === 'file')?.path;
  }, [snapshot]);
  const selected = selectedPath && filePaths.has(selectedPath) ? selectedPath : defaultPath;

  const toggleDir = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const hasMirrors = repo.cloneUrls.length > 0;

  return (
    <Card className="overflow-hidden">
      {/* CardHeader is a grid (one row per child), so the toolbar lives in a single flex child. */}
      <CardHeader className="pb-4">
        <div className="flex flex-wrap items-center gap-2">
          {branches.length > 0 ? (
            <Popover open={branchOpen} onOpenChange={setBranchOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 max-w-48 gap-1.5 font-mono text-xs"
                  aria-label="Switch branch"
                >
                  <GitBranch className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="min-w-0 truncate">{branch}</span>
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
                            setBranch(value);
                            setBranchOpen(false);
                          }}
                          className="gap-2 font-mono text-xs"
                        >
                          <span className="min-w-0 truncate">{b.name}</span>
                          {b.name === state?.headBranch && (
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
          ) : (
            <CardTitle className="flex items-center gap-2 text-base">
              <FolderGit2 className="size-4 text-primary" aria-hidden="true" /> Files
            </CardTitle>
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
      </CardHeader>

      <CardContent className="p-0">
        {!hasMirrors ? (
          <p className="px-8 py-12 text-center text-sm text-muted-foreground">
            This repository doesn't list any clone mirrors, so its files can't be browsed here.
          </p>
        ) : isLoading ? (
          <div className="flex flex-col items-center gap-3 px-8 py-14 text-center">
            <span className="grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-primary/15 to-nebula/15 ring-1 ring-primary/20">
              <Loader2 className="size-5 animate-spin text-primary" aria-hidden="true" />
            </span>
            <p className="text-sm font-medium">Cloning over smart HTTP…</p>
            <p className="max-w-xs text-xs text-muted-foreground">
              Fetching a shallow packfile straight into your browser — no server in between.
            </p>
          </div>
        ) : isError || !snapshot ? (
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
        ) : snapshot.tree.length === 0 ? (
          <p className="px-8 py-12 text-center text-sm text-muted-foreground">
            This repository is empty.
          </p>
        ) : (
          <div className="grid md:grid-cols-[250px_minmax(0,1fr)]">
            <div className="max-h-56 overflow-y-auto border-b border-border/60 md:max-h-[46rem] md:border-b-0 md:border-r">
              <nav aria-label="Repository files" className="p-2">
                {snapshot.tree.map((node) => (
                  <TreeRow
                    key={node.path}
                    node={node}
                    depth={0}
                    expanded={expanded}
                    selected={selected}
                    onToggle={toggleDir}
                    onSelect={setSelectedPath}
                  />
                ))}
              </nav>
            </div>

            <div className="flex min-h-96 flex-col md:max-h-[46rem] md:overflow-y-auto">
              {selected ? (
                <FileViewer snapshot={snapshot} path={selected} />
              ) : (
                <p className="m-auto p-10 text-sm text-muted-foreground">Select a file to view it.</p>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default RepoFileBrowser;
