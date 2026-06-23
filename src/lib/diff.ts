/**
 * Dependency-free line diffing for comparing NIP text.
 *
 * Uses a classic longest-common-subsequence (LCS) walk over lines, then emits
 * a sequence of equal / added / removed rows. Suitable for the modest sizes of
 * NIP markdown documents (a few hundred lines at most); the O(n·m) table is
 * fine here and keeps us off third-party diff libraries (smaller bundle, no CSP
 * surprises).
 */

export type DiffOp = 'equal' | 'add' | 'remove';

/** A single line in a unified diff. */
export interface DiffLine {
  op: DiffOp;
  /** The line text (without trailing newline). */
  text: string;
  /** 1-based line number in the original ("a") document, if present. */
  aLine?: number;
  /** 1-based line number in the new ("b") document, if present. */
  bLine?: number;
}

/** A paired row for side-by-side rendering. */
export interface DiffRow {
  /** Left (original) cell; undefined when the row is a pure addition. */
  left?: { text: string; line: number };
  /** Right (new) cell; undefined when the row is a pure removal. */
  right?: { text: string; line: number };
  /** `equal` when both sides match, otherwise `change`. */
  kind: 'equal' | 'change' | 'add' | 'remove';
}

export interface DiffStats {
  added: number;
  removed: number;
}

function splitLines(text: string): string[] {
  // Normalize CRLF and a single trailing newline so the diff isn't polluted by
  // line-ending noise or a phantom empty final line.
  const normalized = text.replace(/\r\n?/g, '\n').replace(/\n$/, '');
  return normalized.length === 0 ? [] : normalized.split('\n');
}

/**
 * Build the LCS length table for two line arrays. Returns the table so callers
 * can backtrack through it.
 */
function lcsTable(a: string[], b: string[]): number[][] {
  const m = a.length;
  const n = b.length;
  const table: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      table[i][j] = a[i] === b[j]
        ? table[i + 1][j + 1] + 1
        : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  return table;
}

/** Compute a unified line diff between two documents. */
export function diffLines(aText: string, bText: string): DiffLine[] {
  const a = splitLines(aText);
  const b = splitLines(bText);
  const table = lcsTable(a, b);

  const lines: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      lines.push({ op: 'equal', text: a[i], aLine: i + 1, bLine: j + 1 });
      i++;
      j++;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      lines.push({ op: 'remove', text: a[i], aLine: i + 1 });
      i++;
    } else {
      lines.push({ op: 'add', text: b[j], bLine: j + 1 });
      j++;
    }
  }
  while (i < a.length) {
    lines.push({ op: 'remove', text: a[i], aLine: i + 1 });
    i++;
  }
  while (j < b.length) {
    lines.push({ op: 'add', text: b[j], bLine: j + 1 });
    j++;
  }
  return lines;
}

/** Aggregate added/removed counts from a unified diff. */
export function diffStats(lines: DiffLine[]): DiffStats {
  let added = 0;
  let removed = 0;
  for (const line of lines) {
    if (line.op === 'add') added++;
    else if (line.op === 'remove') removed++;
  }
  return { added, removed };
}

/**
 * Convert a unified diff into paired rows for side-by-side rendering. Runs of a
 * removal immediately followed by an addition are zipped together as `change`
 * rows so edits line up across the two columns.
 */
export function toSideBySide(lines: DiffLine[]): DiffRow[] {
  const rows: DiffRow[] = [];
  let k = 0;
  while (k < lines.length) {
    const line = lines[k];
    if (line.op === 'equal') {
      rows.push({
        kind: 'equal',
        left: { text: line.text, line: line.aLine! },
        right: { text: line.text, line: line.bLine! },
      });
      k++;
      continue;
    }

    // Gather a contiguous block of removals then additions.
    const removals: DiffLine[] = [];
    const additions: DiffLine[] = [];
    while (k < lines.length && lines[k].op === 'remove') removals.push(lines[k++]);
    while (k < lines.length && lines[k].op === 'add') additions.push(lines[k++]);

    const max = Math.max(removals.length, additions.length);
    for (let r = 0; r < max; r++) {
      const rem = removals[r];
      const add = additions[r];
      rows.push({
        kind: rem && add ? 'change' : rem ? 'remove' : 'add',
        left: rem ? { text: rem.text, line: rem.aLine! } : undefined,
        right: add ? { text: add.text, line: add.bLine! } : undefined,
      });
    }
  }
  return rows;
}
