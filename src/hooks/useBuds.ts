import { useQuery } from '@tanstack/react-query';

const BLOSSOM_RAW_BASE = 'https://raw.githubusercontent.com/hzrd149/blossom/refs/heads/master';

export interface BudEventKind {
  kind: string;
  description: string;
  buds: string[];
}

export interface Bud {
  /** BUD number/code as it appears in the repo, e.g. "00", "01", "12". */
  number: string;
  title: string;
  /** Event kinds this BUD defines (from the README "Event kinds" table). */
  eventKinds?: BudEventKind[];
}

/**
 * Parse the Blossom README's "Event kinds" table:
 *
 *   | kind    | description         | BUD                |
 *   | ------- | ------------------- | ------------------ |
 *   | `24242` | Authorization token | [11](./buds/11.md) |
 */
function parseEventKindsTable(readme: string): BudEventKind[] {
  const eventKinds: BudEventKind[] = [];
  const lines = readme.split('\n');

  const start = lines.findIndex((line) => /##\s+Event kinds/i.test(line));
  if (start === -1) return eventKinds;

  let i = start;
  while (i < lines.length && !lines[i].startsWith('| `')) i++;

  while (i < lines.length && lines[i].startsWith('|')) {
    const line = lines[i].trim();
    if (line.startsWith('| `')) {
      const cells = line.split('|').map((c) => c.trim());
      if (cells.length >= 4) {
        const kind = cells[1].replace(/`/g, '').trim();
        const description = cells[2].trim();
        // BUD cell looks like "[11](./buds/11.md)"; pull the bracketed code.
        const matches = cells[3].match(/\[([A-Za-z0-9]+)\]/g);
        const buds = matches ? matches.map((m) => m.slice(1, -1)) : [];
        if (kind && buds.length > 0) {
          eventKinds.push({ kind, description, buds });
        }
      }
    }
    i++;
  }

  return eventKinds;
}

/**
 * Parse the BUD index from the Blossom repo's top-level README, which lists
 * entries like:
 *
 *   - [BUD-00: Blossom Upgrade Documents](./buds/00.md)
 */
function parseBudsFromReadme(readme: string): Bud[] {
  const lines = readme.split('\n');
  const buds: Bud[] = [];
  const seen = new Set<string>();
  const eventKinds = parseEventKindsTable(readme);

  for (const line of lines) {
    const match = line.match(/\[BUD-([A-Za-z0-9]+):\s*([^\]]+)\]\(\.?\/?buds\/([A-Za-z0-9]+)\.md\)/);
    if (!match) continue;

    const [, number, title] = match;
    if (seen.has(number)) continue;
    seen.add(number);

    const budEventKinds = eventKinds.filter((ek) => ek.buds.includes(number));

    buds.push({
      number,
      title: title.trim(),
      eventKinds: budEventKinds.length > 0 ? budEventKinds : undefined,
    });
  }

  return buds;
}

/** Fetch and parse the BUD index from the hzrd149/blossom README. */
export function useBuds() {
  return useQuery({
    queryKey: ['buds'],
    queryFn: async ({ signal }) => {
      const response = await fetch(`${BLOSSOM_RAW_BASE}/README.md`, { signal });
      if (!response.ok) throw new Error('Failed to fetch BUDs index');
      return parseBudsFromReadme(await response.text());
    },
    staleTime: 1000 * 60 * 60, // 1 hour
    gcTime: 1000 * 60 * 60 * 24, // 24 hours
  });
}

/** Fetch the raw Markdown of a single BUD by its number/code. */
export function useBud(budNumber: string | undefined) {
  return useQuery({
    queryKey: ['bud', budNumber],
    queryFn: async ({ signal }) => {
      const response = await fetch(`${BLOSSOM_RAW_BASE}/buds/${budNumber}.md`, { signal });
      if (!response.ok) throw new Error(`Failed to fetch BUD-${budNumber}`);
      const content = await response.text();
      return { content, budNumber: budNumber! };
    },
    enabled: !!budNumber,
    staleTime: 1000 * 60 * 60,
    gcTime: 1000 * 60 * 60 * 24,
  });
}
