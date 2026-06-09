import { useQuery } from '@tanstack/react-query';

const NIPS_RAW_BASE = 'https://raw.githubusercontent.com/nostr-protocol/nips/refs/heads/master';

export interface EventKind {
  kind: string;
  description: string;
  nips: string[];
  deprecated?: boolean;
}

export interface OfficialNip {
  /** NIP number/code as it appears in the repo, e.g. "01", "7D", "C7". */
  number: string;
  title: string;
  deprecated?: boolean;
  /** Trailing note from the index (e.g. "unrecommended: ..."). */
  note?: string;
  eventKinds?: EventKind[];
}

function parseEventKindsTable(readme: string): EventKind[] {
  const eventKinds: EventKind[] = [];
  const lines = readme.split('\n');

  const start = lines.findIndex((line) => line.includes('## Event Kinds'));
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
        const nips: string[] = [];
        let deprecated = false;

        if (cells[3].includes('deprecated')) {
          const m = cells[3].match(/(\d+)\s*\(deprecated\)/);
          if (m) {
            nips.push(m[1]);
            deprecated = true;
          }
        } else {
          const matches = cells[3].match(/\[([A-F0-9]+)\]/g);
          if (matches) nips.push(...matches.map((m) => m.slice(1, -1)));
        }

        if (nips.length > 0) {
          eventKinds.push({ kind, description, nips, deprecated });
        }
      }
    }
    i++;
  }

  return eventKinds;
}

function parseNipsFromReadme(readme: string): OfficialNip[] {
  const lines = readme.split('\n');
  const nips: OfficialNip[] = [];
  const eventKinds = parseEventKindsTable(readme);

  for (const line of lines) {
    // Matches: "- [NIP-01: Basic protocol flow description](01.md)" and
    // struck-through "~~[NIP-04: ...](04.md) --- **unrecommended**: ...~~".
    const match = line.match(/\[NIP-([A-F0-9]+): ([^\]]+)\]\(([A-F0-9]+)\.md\)/);
    if (!match) continue;

    const [, number, title] = match;
    let deprecated = false;
    let note: string | undefined;

    const noteMatch = line.match(/\.md\)\s*---\s*(.+?)~*\s*$/);
    if (noteMatch) {
      note = noteMatch[1]
        .replace(/\*\*/g, '')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // unwrap markdown links
        .trim();
      if (note.includes('unrecommended') || note.includes('deprecated')) {
        deprecated = true;
      }
    }
    // A struck-through entry (~~...~~) is also deprecated/unrecommended.
    if (line.includes('~~')) deprecated = true;

    const nipEventKinds = eventKinds.filter((ek) => ek.nips.includes(number));

    nips.push({
      number,
      title: title.trim(),
      deprecated,
      note,
      eventKinds: nipEventKinds.length > 0 ? nipEventKinds : undefined,
    });
  }

  return nips;
}

/** Fetch and parse the official NIPs index from the nostr-protocol/nips README. */
export function useOfficialNips() {
  return useQuery({
    queryKey: ['official-nips'],
    queryFn: async ({ signal }) => {
      const response = await fetch(`${NIPS_RAW_BASE}/README.md`, { signal });
      if (!response.ok) throw new Error('Failed to fetch NIPs index');
      return parseNipsFromReadme(await response.text());
    },
    staleTime: 1000 * 60 * 60, // 1 hour
    gcTime: 1000 * 60 * 60 * 24, // 24 hours
  });
}

/** Fetch the raw Markdown of a single official NIP by its number/code. */
export function useOfficialNip(nipNumber: string | undefined) {
  return useQuery({
    queryKey: ['official-nip', nipNumber],
    queryFn: async ({ signal }) => {
      const response = await fetch(`${NIPS_RAW_BASE}/${nipNumber}.md`, { signal });
      if (!response.ok) throw new Error(`Failed to fetch NIP-${nipNumber}`);
      const content = await response.text();
      return { content, nipNumber: nipNumber! };
    },
    enabled: !!nipNumber,
    staleTime: 1000 * 60 * 60,
    gcTime: 1000 * 60 * 60 * 24,
  });
}
