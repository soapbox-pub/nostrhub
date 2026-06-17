import { useMemo, useState } from 'react';
import { Columns2, Rows3 } from 'lucide-react';
import {
  diffLines,
  diffStats,
  toSideBySide,
  type DiffLine,
  type DiffRow,
} from '@/lib/diff';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';

type DiffMode = 'unified' | 'split';

interface DiffViewProps {
  /** Original ("before") document text. */
  oldText: string;
  /** New ("after") document text. */
  newText: string;
  /** Short label for the original side, e.g. the source NIP title. */
  oldLabel?: string;
  /** Short label for the new side, e.g. this fork's title. */
  newLabel?: string;
  className?: string;
}

const LINE_NO = 'select-none pr-3 text-right tabular-nums text-muted-foreground/60';
const CELL = 'whitespace-pre-wrap break-words py-0.5 pr-3';

/**
 * Renders a textual diff between two NIP documents with a toggle between a
 * unified (single-column) and split (side-by-side) layout. Pure presentation:
 * the diff itself comes from the dependency-free `lib/diff` LCS walk.
 */
export function DiffView({
  oldText,
  newText,
  oldLabel = 'Original',
  newLabel = 'Changed',
  className,
}: DiffViewProps) {
  const [mode, setMode] = useState<DiffMode>('unified');

  const lines = useMemo(() => diffLines(oldText, newText), [oldText, newText]);
  const stats = useMemo(() => diffStats(lines), [lines]);
  const rows = useMemo(() => toSideBySide(lines), [lines]);

  const identical = stats.added === 0 && stats.removed === 0;

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 text-sm">
          <span className="font-medium text-emerald-600 dark:text-emerald-400">
            +{stats.added}
          </span>
          <span className="font-medium text-rose-600 dark:text-rose-400">
            −{stats.removed}
          </span>
          <span className="text-muted-foreground">
            {identical ? 'No differences' : `${stats.added + stats.removed} changed lines`}
          </span>
        </div>

        <ToggleGroup
          type="single"
          value={mode}
          onValueChange={(v) => v && setMode(v as DiffMode)}
          variant="outline"
          size="sm"
          aria-label="Diff layout"
        >
          <ToggleGroupItem value="unified" aria-label="Unified diff" className="gap-1.5">
            <Rows3 className="size-3.5" aria-hidden="true" /> Unified
          </ToggleGroupItem>
          <ToggleGroupItem value="split" aria-label="Side-by-side diff" className="gap-1.5">
            <Columns2 className="size-3.5" aria-hidden="true" /> Side-by-side
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {identical ? (
        <div className="rounded-lg border border-dashed py-10 text-center">
          <p className="text-sm text-muted-foreground">
            These two versions are identical.
          </p>
        </div>
      ) : mode === 'unified' ? (
        <UnifiedDiff lines={lines} />
      ) : (
        <SplitDiff rows={rows} oldLabel={oldLabel} newLabel={newLabel} />
      )}
    </div>
  );
}

function UnifiedDiff({ lines }: { lines: DiffLine[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border bg-muted/30">
      <table className="w-full border-collapse font-mono text-xs leading-relaxed sm:text-[13px]">
        <tbody>
          {lines.map((line, i) => (
            <tr
              key={i}
              className={cn(
                line.op === 'add' && 'bg-emerald-500/10',
                line.op === 'remove' && 'bg-rose-500/10',
              )}
            >
              <td className={cn(LINE_NO, 'pl-3')}>{line.aLine ?? ''}</td>
              <td className={LINE_NO}>{line.bLine ?? ''}</td>
              <td
                className={cn(
                  'w-4 select-none pr-2 text-center',
                  line.op === 'add' && 'text-emerald-600 dark:text-emerald-400',
                  line.op === 'remove' && 'text-rose-600 dark:text-rose-400',
                )}
              >
                {line.op === 'add' ? '+' : line.op === 'remove' ? '−' : ''}
              </td>
              <td className={CELL}>{line.text || '\u00A0'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SplitDiff({
  rows,
  oldLabel,
  newLabel,
}: {
  rows: DiffRow[];
  oldLabel: string;
  newLabel: string;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border bg-muted/30">
      <table className="w-full table-fixed border-collapse font-mono text-xs leading-relaxed sm:text-[13px]">
        <thead>
          <tr className="border-b bg-muted/50 text-left font-sans">
            <th colSpan={2} className="truncate px-3 py-1.5 text-xs font-medium text-muted-foreground">
              {oldLabel}
            </th>
            <th colSpan={2} className="truncate border-l px-3 py-1.5 text-xs font-medium text-muted-foreground">
              {newLabel}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const leftChanged = row.kind === 'change' || row.kind === 'remove';
            const rightChanged = row.kind === 'change' || row.kind === 'add';
            return (
              <tr key={i}>
                <td className={cn('w-10', LINE_NO, 'pl-3', leftChanged && 'bg-rose-500/10')}>
                  {row.left?.line ?? ''}
                </td>
                <td className={cn(CELL, leftChanged && 'bg-rose-500/10')}>
                  {row.left ? row.left.text || '\u00A0' : ''}
                </td>
                <td
                  className={cn('w-10 border-l', LINE_NO, 'pl-3', rightChanged && 'bg-emerald-500/10')}
                >
                  {row.right?.line ?? ''}
                </td>
                <td className={cn(CELL, rightChanged && 'bg-emerald-500/10')}>
                  {row.right ? row.right.text || '\u00A0' : ''}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default DiffView;
