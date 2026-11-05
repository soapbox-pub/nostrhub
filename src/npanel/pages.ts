/**
 * Previews of NostrHub's pages that aren't a Nostr event: its directories,
 * chat channels, official NIPs and Blossom BUDs, and event kinds.
 *
 * The directories are what the app titles them. An official NIP or a BUD is
 * read from GitHub, as the app reads it, and a kind from the NIPs' and
 * Blossom's indexes of kinds.
 */

import { getChannel, normalizeTopic } from '@/lib/chat';

import { APP_NAME, describe, type Preview, withoutNulls } from './card';
import { drawCard } from './draw';
import { escape, markdownText, renderMarkdown } from './html';
import { clamp, list, paragraph } from './kinds';

const NIPS_RAW = 'https://raw.githubusercontent.com/nostr-protocol/nips/refs/heads/master';
const NIPS_GITHUB = 'https://github.com/nostr-protocol/nips/blob/master';
const BLOSSOM_RAW = 'https://raw.githubusercontent.com/hzrd149/blossom/refs/heads/master';
const BLOSSOM_GITHUB = 'https://github.com/hzrd149/blossom/blob/master/buds';

/** The site's directories, titled and described as the app does. */
const DIRECTORIES: Record<string, { title: string; description: string }> = {
  nips: {
    title: 'NIPs',
    description: 'Browse Nostr Implementation Possibilities: community-curated specs and fresh drafts, ranked by expert approval.',
  },
  articles: {
    title: 'Articles',
    description: 'Long-form dispatches from the panel: in-depth articles and essays on building the Nostr protocol.',
  },
  repos: {
    title: 'Repositories',
    description: 'Discover git repositories announced on Nostr. Clone them over relays, no forge required.',
  },
  apps: {
    title: 'Apps',
    description: 'Discover Nostr applications announced on the network via NIP-89. Search the directory and see how well each app implements the NIPs.',
  },
  releases: {
    title: 'Releases',
    description: 'Browse software releases published to Zapstore on Nostr. Filter by category to discover apps.',
  },
  plan: {
    title: 'Plan',
    description: 'The community plan graph: a shared map of goals, problems, and tasks for building Nostr together.',
  },
  stats: {
    title: 'Network Stats',
    description: 'Live Nostr network statistics: active users, event volume, and client breakdowns.',
  },
  experts: {
    title: 'Experts',
    description: 'The Nostr Experts who anchor NostrHub’s trust model: their approvals rank NIPs and their follows shape the community.',
  },
  compare: {
    title: 'Compare NIPs',
    description: 'See exactly what changed between two NIPs or a fork and its source.',
  },
};

/** A directory's preview, or a chat channel's. The site's own image stands for each. */
export function directory(segments: string[], url: string): Preview | null {
  if (segments[0] === 'chat') {
    const channel = getChannel(normalizeTopic(segments[1]));
    return {
      title: `#${channel.label} | ${APP_NAME} Community`,
      description: `${channel.description} Join the public #${channel.label} channel and chat with the Nostr developer community.`,
      body: `<article>\n<h1>#${escape(channel.label)}</h1>\n${paragraph(escape(channel.description))}</article>\n`,
      canonical: `/chat/${channel.topic}`,
      type: 'website',
    };
  }
  const page = segments.length === 1 ? DIRECTORIES[segments[0]] : undefined;
  if (!page) return null;
  return {
    title: `${page.title} | ${APP_NAME}`,
    description: page.description,
    body: `<article>\n<h1>${escape(page.title)}</h1>\n${paragraph(escape(page.description))}</article>\n`,
    canonical: url,
    type: 'website',
  };
}

type Spec = 'nip' | 'bud';

/** An official NIP's page, or a BUD's: its title, its first words, and the whole of it to read. */
export async function specification(spec: Spec, code: string, page: { url: string; origin: string }): Promise<Preview | null> {
  const name = `${spec === 'nip' ? 'NIP' : 'BUD'}-${code}`;
  const raw = spec === 'nip' ? `${NIPS_RAW}/${code}.md` : `${BLOSSOM_RAW}/buds/${code}.md`;
  const github = spec === 'nip' ? `${NIPS_GITHUB}/${code}.md` : `${BLOSSOM_GITHUB}/${code}.md`;

  const markdown = await text(raw);
  if (!markdown) return null;
  const doc = readSpec(markdown, name);
  const title = doc.title ? `${name}: ${doc.title}` : name;
  const description = describe(doc.intro) ?? `Read and approve ${name} on ${APP_NAME}.`;

  // Its links to other NIPs, `23.md`, or BUDs, `02.md`, are to their pages here.
  const relative = (url: string) => {
    const match = /^(?:\.\/)?(?:buds\/)?([0-9A-Fa-f]{2})\.md(#.*)?$/.exec(url);
    return match ? `/${spec}/${spec === 'nip' ? match[1].toUpperCase() : match[1].toLowerCase()}` : undefined;
  };
  let body = `<article>\n<header>\n<h1>${escape(title)}</h1>\n`;
  if (doc.status.length) body += paragraph(doc.status.map(escape).join(' · '));
  body += paragraph(`<a href="${escape(github)}">Read ${name} on GitHub</a>`);
  body += '</header>\n' + renderMarkdown(doc.body, relative) + '</article>\n';

  return {
    title,
    description,
    body,
    image: drawCard({
      label: spec === 'nip' ? `Official NIP · ${doc.status.join(' · ') || 'Nostr protocol'}` : `Blossom BUD · ${doc.status.join(' · ') || 'Blossom protocol'}`,
      title: doc.title ? `${name}: ${doc.title}` : name,
      subtitle: doc.intro && clamp(doc.intro, 200),
      footer: spec === 'nip' ? 'nostr-protocol/nips' : 'hzrd149/blossom',
    }, page.origin),
    twitter: 'summary_large_image',
    type: 'article',
    canonical: page.url,
    jsonLd: withoutNulls({
      '@context': 'https://schema.org',
      '@type': 'TechArticle',
      headline: [...title].slice(0, 110).join(''),
      description,
      url: page.url,
      mainEntityOfPage: page.url,
      isBasedOn: github,
    }),
  };
}

interface SpecDoc {
  /** Its title, without the `NIP-23` heading above it. */
  title?: string;
  /** Its badges: `draft`, `optional`. */
  status: string[];
  /** Its first paragraph of prose. */
  intro?: string;
  /** All of it, but its title and badges. */
  body: string;
}

/**
 * A NIP's or a BUD's Markdown, read for its parts. NIPs head themselves
 * `NIP-23`, underlined, then their title, underlined; BUDs `# BUD-02`, then
 * `## Blob upload`. Either way, the first heading that isn't the name is the
 * title, and a line of `code spans` after it is the badges.
 */
export function readSpec(markdown: string, name: string): SpecDoc {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const doc: SpecDoc = { status: [], body: '' };
  let i = 0;
  const heading = (): string | undefined => {
    const line = lines[i]?.trim() ?? '';
    if (/^#{1,6}\s+/.test(line)) {
      i += 1;
      return line.replace(/^#{1,6}\s+/, '').replace(/\s+#+\s*$/, '').trim();
    }
    if (line && /^(=+|-+)$/.test(lines[i + 1]?.trim() ?? '')) {
      i += 2;
      return line;
    }
    return undefined;
  };
  const skipBlank = () => {
    while (i < lines.length && !lines[i].trim()) i += 1;
  };

  // Up to two headings: its name, then its title.
  for (let h = 0; h < 2; h++) {
    skipBlank();
    const found = heading();
    if (found === undefined) break;
    if (found.replace(/\s+/g, '').toUpperCase() !== name.toUpperCase()) {
      doc.title = found;
      break;
    }
  }
  skipBlank();
  const badges = lines[i]?.trim() ?? '';
  if (/^(`[^`]+`\s*)+$/.test(badges)) {
    doc.status = [...badges.matchAll(/`([^`]+)`/g)].map((m) => m[1].trim());
    i += 1;
  }
  doc.body = lines.slice(i).join('\n');

  // The first paragraph that is prose: not a heading, a list, code or a note in italics alone.
  for (const block of doc.body.split(/\n\s*\n/)) {
    const trimmed = block.trim();
    if (!trimmed || /^(#|[-*+] |\d+\. |```|\||>|=|_[^_]+_$|\*[^*]+\*$)/.test(trimmed) || /^[-=]+$/m.test(trimmed)) continue;
    const words = markdownText(trimmed).replace(/\s+/g, ' ').trim();
    if (words) {
      doc.intro = words;
      break;
    }
  }
  return doc;
}

interface KindEntry {
  description: string;
  /** Where it's defined: `NIP-23`, `BUD-11`. */
  specs: string[];
}

/** A kind's page: what the indexes call it, and the NIPs and BUDs that define it. */
export async function kindPage(kind: number, page: { url: string; origin: string }): Promise<Preview> {
  const [nips, blossom] = await Promise.all([text(`${NIPS_RAW}/README.md`), text(`${BLOSSOM_RAW}/README.md`)]);
  const entries = [
    ...(nips ? kindsTable(nips, /##\s+Event Kinds/i, /\[([0-9A-F]{2})\]/g, 'NIP') : []),
    ...(blossom ? kindsTable(blossom, /##\s+Event kinds/i, /\[([A-Za-z0-9]{2})\]/g, 'BUD') : []),
  ].filter((entry) => covers(entry.kinds, kind));

  const exact = entries.find((entry) => entry.kinds === String(kind)) ?? entries[0];
  const specs = [...new Set(entries.flatMap((entry) => entry.specs))];
  const what = exact?.description;
  const title = what ? `Kind ${kind}: ${what}` : `Kind ${kind}`;
  const description = [
    what ? `${what}: event kind ${kind} on Nostr.` : `Event kind ${kind} on Nostr.`,
    specs.length ? `Defined in ${specs.join(', ')}.` : undefined,
    storageClass(kind),
  ].filter(Boolean).join(' ');

  let body = `<article>\n<header>\n<h1>${escape(title)}</h1>\n${paragraph(escape(storageClass(kind)))}</header>\n`;
  if (specs.length) {
    const links = specs.map((spec) => `<a href="/${spec.startsWith('NIP') ? 'nip' : 'bud'}/${spec.slice(4)}">${spec}</a>`);
    body += `<h2>Defined in</h2>\n${list(links, links.length)}`;
  }
  body += '</article>\n';

  return {
    title,
    description,
    body,
    image: drawCard({ label: 'Event kind', title: what ? `${kind}: ${what}` : `Kind ${kind}`, subtitle: storageClass(kind), footer: specs.length ? `Defined in ${specs.slice(0, 4).join(', ')}` : undefined }, page.origin),
    twitter: 'summary_large_image',
    type: 'article',
    canonical: page.url,
    jsonLd: withoutNulls({ '@context': 'https://schema.org', '@type': 'WebPage', name: title, description, url: page.url }),
  };
}

/** The table of kinds an index has under a heading: `| \`30023\` | Long-form Content | [23](23.md) |`. */
function kindsTable(readme: string, heading: RegExp, spec: RegExp, prefix: string): (KindEntry & { kinds: string })[] {
  const lines = readme.split('\n');
  let i = lines.findIndex((line) => heading.test(line));
  if (i < 0) return [];
  while (i < lines.length && !lines[i].startsWith('| `')) i += 1;
  const entries: (KindEntry & { kinds: string })[] = [];
  for (; i < lines.length && lines[i].startsWith('|'); i++) {
    const cells = lines[i].split('|').map((c) => c.trim());
    if (cells.length < 4 || !cells[1].startsWith('`')) continue;
    const specs = [...cells[3].matchAll(spec)].map((m) => `${prefix}-${m[1]}`);
    entries.push({ kinds: cells[1].replace(/`/g, '').trim(), description: cells[2].replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').trim(), specs });
  }
  return entries;
}

/** Whether a kind cell, `20` or `5000-5999`, covers a kind. */
function covers(cell: string, kind: number): boolean {
  const range = /^(\d+)\s*-\s*(\d+)$/.exec(cell);
  return range ? kind >= Number(range[1]) && kind <= Number(range[2]) : cell === String(kind);
}

/** What NIP-01 says relays do with a kind. */
function storageClass(kind: number): string {
  if (kind >= 30000 && kind < 40000) return 'An addressable event: relays keep only the latest per author and d-tag.';
  if (kind >= 20000 && kind < 30000) return 'An ephemeral event: relays pass it on but are not expected to store it.';
  if (kind >= 10000 && kind < 20000) return 'A replaceable event: relays keep only the latest per author.';
  if (kind >= 1000 && kind < 10000) return 'A regular event, stored by relays.';
  return 'A legacy-range event, stored as its NIP defines.';
}

/** A text file from the web, or undefined. */
async function text(url: string): Promise<string | undefined> {
  try {
    const response = await fetch(url);
    return response.ok ? await response.text() : undefined;
  } catch {
    return undefined;
  }
}
