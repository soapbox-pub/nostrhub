import { cn } from '@/lib/utils';

/** Per-line styling for `git format-patch` content. */
function lineClass(line: string): string | undefined {
  if (line.startsWith('+++') || line.startsWith('---')) {
    return 'font-semibold text-muted-foreground';
  }
  if (line.startsWith('+')) {
    return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400';
  }
  if (line.startsWith('-')) {
    return 'bg-red-500/10 text-red-700 dark:text-red-400';
  }
  if (line.startsWith('@@')) {
    return 'text-sky-700 dark:text-sky-400';
  }
  if (line.startsWith('diff --git') || line.startsWith('index ')) {
    return 'font-semibold text-foreground';
  }
  if (/^(From|Date|Subject):? /.test(line) || line.startsWith('From ')) {
    return 'text-muted-foreground';
  }
  return undefined;
}

/**
 * Render a NIP-34 patch (kind 1617) — raw `git format-patch` output — as a
 * scrollable diff with GitHub-style +/− line coloring. Content is rendered as
 * text nodes only, so untrusted patch text can't inject markup.
 */
export function PatchDiff({ content }: { content: string }) {
  const lines = content.replace(/\r\n/g, '\n').split('\n');

  return (
    <pre
      className="max-h-[36rem] overflow-auto rounded-lg border bg-muted/30 p-3 font-mono text-xs leading-relaxed sm:p-4"
      aria-label="Patch diff"
    >
      {lines.map((line, i) => (
        <div key={i} className={cn('min-h-4 whitespace-pre-wrap break-all px-1', lineClass(line))}>
          {line || '\u00A0'}
        </div>
      ))}
    </pre>
  );
}

export default PatchDiff;
