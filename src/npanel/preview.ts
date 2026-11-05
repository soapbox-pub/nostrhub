/**
 * NostrHub's link previews, for npanel to show crawlers.
 *
 * npanel runs this for a crawler asking for one of the pages `routes` names,
 * in a QuickJS sandbox with an `OffscreenCanvas` that draws text in the
 * gateway's fonts. It's built into `dist/.well-known/npanel/preview.js` by
 * `vite.config.ts`. What it returns is all a crawler gets: `null` leaves the
 * page as published, with `index.html`'s own preview of the site.
 *
 * Every page NostrHub shows a Nostr event on has a preview (`kinds.ts`): a
 * NIP, an article, a repository and its issues, pull requests and patches,
 * an app, a release, a plan node, a note, a comment. Each has the event's own
 * title and words, and the event as an article a search engine can read.
 * Those without a picture of their own get a card drawn (`draw.ts`). So do
 * the pages that aren't events (`pages.ts`): an official NIP or BUD, read
 * from GitHub, an event kind, and the site's directories.
 *
 * A preview says who did what: "Alex closed “Fix the build”", with the
 * issue's words. So it fetches the event a status change, an update or a
 * comment is about, the repository an issue is filed against, and the
 * profiles of the people its title names.
 */

import type { NostrEvent, NostrFilter, NRelay } from '@nostrify/nostrify';
import * as nip19 from 'nostr-tools/nip19';

import { eventPreview, type Page, type Preview, profilePreview, readProfile, time } from './card';
import { escape } from './html';
import {
  APP_KIND, ARTICLE_KIND, clamp, CUSTOM_NIP_KIND, eventAddress, isHex64, ISSUE_KIND, list, PATCH_KIND, PR_KIND, read, reference,
  REPO_KIND, REPO_STATE_KIND, SUPPORTED, tag, ZAPSTORE_APP_KIND,
} from './kinds';
import { directory, kindPage, specification } from './pages';

interface Context {
  nostr: NRelay;
  signal: AbortSignal;
}

/** What a profile's page lists of what they've made here: NIPs, repositories, apps, articles. */
const MADE_KINDS = [CUSTOM_NIP_KIND, REPO_KIND, APP_KIND, ARTICLE_KIND, ZAPSTORE_APP_KIND];
/** How many: npanel lets a preview have 50 events in all. */
const MAX_MADE = 20;
/** How many of a repository's issues, pull requests and patches its page lists. */
const MAX_TICKETS = 20;

/** A NIP-19 entity, as a path segment has it. */
const BECH32 = String.raw`n(?:pub|profile|ote|event|addr)1[02-9ac-hj-np-z]+`;
/** A NIP-05 name, `name@domain`, or a bare domain, with its `@` as written or percent-encoded. */
const NIP05 = String.raw`(?:[\w.+\-]+(?:@|%40))?[\w\-]+(?:\.[\w\-]+)*\.[A-Za-z][\w\-]*`;
/** Whose a repository is: an npub, an nprofile, a hex key, or a NIP-05 name. */
const OWNER = String.raw`(?:npub1[02-9ac-hj-np-z]+|nprofile1[02-9ac-hj-np-z]+|[0-9a-f]{64}|${NIP05})`;

export default {
  /**
   * The pages previewed, as URLPattern pathnames, as `preview` reads them.
   * Everything else is never run for, and keeps one page for everyone. A
   * hyphen in a character class is escaped, as a browser's URLPattern
   * requires, though npanel's doesn't.
   */
  routes: [
    String.raw`/:id((?:@|%40)?${BECH32}){/}?`,
    String.raw`/:name((?:@|%40)?${NIP05}){/}?`,
    String.raw`/:spec(nip|bud)/:code([0-9A-Za-z]{2}){/}?`,
    String.raw`/k/:kind(\d{1,6}){/}?`,
    String.raw`/:page(nips|articles|repos|apps|releases|plan|stats|experts|compare|chat){/}?`,
    String.raw`/chat/:topic([\w\-]+){/}?`,
    // A repository, `/<owner>/<repo>`, with a relay between them or not, and
    // its issues and pull requests, as NIP-34 clone URIs and gitworkshop name them.
    String.raw`/:owner(${OWNER})/:a{/}?`,
    String.raw`/:owner(${OWNER})/:a/:b{/}?`,
    String.raw`/:owner(${OWNER})/:a/:b/:c{/}?`,
    String.raw`/:owner(${OWNER})/:a/:b/:c/:d{/}?`,
  ],

  async preview(request: Request, { nostr, signal }: Context): Promise<Preview | null> {
    const url = new URL(request.url);
    const segments = url.pathname.split('/').filter(Boolean).map((s) => {
      try {
        return decodeURIComponent(s);
      } catch {
        return s;
      }
    });
    const first = async (filter: NostrFilter) => (await nostr.query([{ ...filter, limit: 1 }], { signal }))[0];
    const at = (path: string): Page => ({ url: `${url.origin}${path}`, origin: url.origin });

    if (segments.length === 0) return null;
    const [head, ...rest] = segments;

    if ((head === 'nip' || head === 'bud') && rest.length === 1 && /^[0-9A-Za-z]{2}$/.test(rest[0])) {
      const code = head === 'nip' ? rest[0].toUpperCase() : rest[0].toLowerCase();
      return specification(head, code, at(`/${head}/${code}`));
    }
    if (head === 'k' && rest.length === 1 && /^\d{1,6}$/.test(rest[0])) {
      return kindPage(Number(rest[0]), at(`/k/${Number(rest[0])}`));
    }
    const listed = directory(segments, `${url.origin}/${segments.join('/')}`);
    if (listed) return listed;

    if (segments.length === 1) {
      const found = await subject(head.replace(/^@/, ''), first);
      return found ? eventPage(found, { nostr, signal, first, at }) : null;
    }

    // A repository, or an issue or pull request filed against one.
    const owner = await ownerOf(head);
    if (!owner) return null;
    const tab = (s: string | undefined) => s === 'issues' || s === 'prs';
    let repo: string | undefined;
    let ticket: string | undefined;
    switch (rest.length) {
      case 1: repo = rest[0]; break;
      case 2: repo = tab(rest[1]) ? rest[0] : rest[1]; break;
      case 3:
        if (tab(rest[1])) [repo, , ticket] = rest;
        else if (tab(rest[2])) repo = rest[1];
        break;
      case 4: if (tab(rest[2])) [, repo, , ticket] = rest; break;
    }
    if (ticket !== undefined) {
      // The ticket names its repository itself, as the app reads it.
      const found = /^n(?:ote|event)1/.test(ticket) ? await subject(ticket, first) : undefined;
      return found ? eventPage(found, { nostr, signal, first, at }) : null;
    }
    if (!repo) return null;
    const [event, profile] = await Promise.all([
      first({ kinds: [REPO_KIND], authors: [owner], '#d': [repo] }),
      first({ kinds: [0], authors: [owner] }),
    ]);
    return event ? eventPage({ event, profile }, { nostr, signal, first, at }) : null;
  },
};

interface Fetching extends Context {
  first: (filter: NostrFilter) => Promise<NostrEvent | undefined>;
  at: (path: string) => Page;
}

/** A page about an event, a profile included. */
async function eventPage(found: { event: NostrEvent; profile?: NostrEvent }, { nostr, signal, first, at }: Fetching): Promise<Preview | null> {
  const { event } = found;

  if (event.kind === 0) {
    const made = await nostr.query([{ kinds: MADE_KINDS, authors: [event.pubkey], limit: MAX_MADE }], { signal });
    return profilePreview(readProfile(event, event.pubkey), at(`/${nip19.npubEncode(event.pubkey)}`), made);
  }

  // At once: the event it's about, for a kind whose preview is made of one,
  // and a repository's newest issues, pull requests and patches.
  const filter = reference(event);
  const d = tag(event, 'd') ?? '';
  const [ref, tickets] = await Promise.all([
    filter ? first(filter) : undefined,
    event.kind === REPO_KIND
      ? nostr.query([{ kinds: [ISSUE_KIND, PR_KIND, PATCH_KIND], '#a': [`${REPO_KIND}:${event.pubkey}:${d}`], limit: MAX_TICKETS }], { signal })
      : [],
  ]);

  const parts = read(event, ref);
  if (!parts) return null;
  if (event.kind === REPO_KIND) parts.extra += ticketList(tickets);

  // The profiles of whoever it's attributed to, and of the others its title
  // names, in one query, but for the one fetched beside it.
  const pubkeys = [...new Set([parts.author, ...(parts.people ?? [])])];
  const wanted = pubkeys.filter((pubkey) => pubkey !== found.profile?.pubkey);
  const profiles = wanted.length ? await nostr.query([{ kinds: [0], authors: wanted, limit: wanted.length }], { signal }) : [];
  if (found.profile) profiles.push(found.profile);
  const profileOf = (pubkey: string) => readProfile(newest(profiles.filter((p) => p.pubkey === pubkey)), pubkey);

  // An event is at the address the app links it by, whichever of the paths
  // that show it was asked for.
  return eventPreview(parts, profileOf(parts.author), at(parts.path ?? `/${eventAddress(event)}`), pubkeys.map(profileOf));
}

/** A repository's issues, pull requests and root patches, newest first, linked to their pages. */
function ticketList(tickets: NostrEvent[]): string {
  const items = tickets
    .filter((t) => t.kind !== PATCH_KIND || t.tags.some(([n, v]) => n === 't' && v === 'root'))
    .sort((a, b) => b.created_at - a.created_at)
    .map((t) => {
      const parts = read(t);
      const what = t.kind === ISSUE_KIND ? 'Issue' : t.kind === PR_KIND ? 'Pull request' : 'Patch';
      return `${what}: <a href="/${eventAddress(t)}">${escape(clamp(parts?.title ?? what, 140))}</a> · ${time(t.created_at)}`;
    });
  return items.length ? `<section>\n<h2>Issues and pull requests</h2>\n${list(items, items.length)}</section>\n` : '';
}

/** The event a page's one segment names, if it's of a kind previewed here, and its author's profile, where that came along. */
async function subject(
  segment: string,
  first: (filter: NostrFilter) => Promise<NostrEvent | undefined>,
): Promise<{ event: NostrEvent; profile?: NostrEvent } | undefined> {
  const profileOf = async (pubkey: string) => mapEvent(await first({ kinds: [0], authors: [pubkey] }));

  if (!/^n(?:pub|profile|ote|event|addr)1/.test(segment)) {
    const pubkey = await nip05(segment);
    return pubkey ? profileOf(pubkey) : undefined;
  }

  let decoded: nip19.DecodedResult;
  try {
    decoded = nip19.decode(segment);
  } catch {
    return undefined;
  }
  switch (decoded.type) {
    case 'npub':
      return profileOf(decoded.data);
    case 'nprofile':
      return profileOf(decoded.data.pubkey);
    case 'note':
      return mapEvent(await first({ ids: [decoded.data] }));
    case 'nevent': {
      const { id, author, kind } = decoded.data;
      // An nevent that says it's of a kind with no preview isn't worth a query.
      if (kind !== undefined && !SUPPORTED.includes(kind)) return undefined;
      if (!author || !isHex64(author)) return mapEvent(await first({ ids: [id] }));
      const [event, profile] = await Promise.all([first({ ids: [id] }), first({ kinds: [0], authors: [author] })]);
      // Asking again by its author looks on the relays they write to.
      const found = event ?? await first({ ids: [id], authors: [author] });
      return found && { event: found, profile };
    }
    case 'naddr': {
      const { pubkey, identifier } = decoded.data;
      // A repository's state is shown as the repository.
      const kind = decoded.data.kind === REPO_STATE_KIND ? REPO_KIND : decoded.data.kind;
      if (!SUPPORTED.includes(kind) || kind < 30000 || kind >= 40000) return undefined;
      const [event, profile] = await Promise.all([
        first({ kinds: [kind], authors: [pubkey], '#d': [identifier] }),
        first({ kinds: [0], authors: [pubkey] }),
      ]);
      return event && { event, profile };
    }
    default:
      return undefined;
  }
}

/** The pubkey a repository's owner segment names: an npub, an nprofile, hex, or a NIP-05 name. */
async function ownerOf(segment: string): Promise<string | undefined> {
  if (/^[0-9a-f]{64}$/.test(segment)) return segment;
  if (segment.startsWith('npub1') || segment.startsWith('nprofile1')) {
    try {
      const decoded = nip19.decode(segment);
      if (decoded.type === 'npub') return decoded.data;
      if (decoded.type === 'nprofile') return decoded.data.pubkey;
    } catch {
      return undefined;
    }
    return undefined;
  }
  return nip05(segment);
}

function newest(events: NostrEvent[]): NostrEvent | undefined {
  return events.reduce<NostrEvent | undefined>((a, b) => (!a || b.created_at > a.created_at ? b : a), undefined);
}

function mapEvent(event: NostrEvent | undefined): { event: NostrEvent } | undefined {
  return event && { event };
}

/** Files a bare domain could be mistaken for: the site's own pages and assets. */
const FILE = /\.(?:html?|js|mjs|css|json|txt|xml|ico|png|jpe?g|gif|webp|svg|webmanifest|map|md)$/i;

/** The pubkey a NIP-05 name, or a bare domain (`_@domain`), stands for. */
async function nip05(address: string): Promise<string | undefined> {
  if (FILE.test(address)) return undefined;
  const at = address.lastIndexOf('@');
  const name = at < 0 ? '_' : address.slice(0, at).toLowerCase() || '_';
  const domain = address.slice(at + 1).toLowerCase();
  if (!/^[\w-]+(?:\.[\w-]+)*\.[a-z][\w-]*$/.test(domain)) return undefined;
  try {
    const response = await fetch(`https://${domain}/.well-known/nostr.json?name=${encodeURIComponent(name)}`);
    if (!response.ok) return undefined;
    const document = await response.json() as { names?: Record<string, unknown> };
    const pubkey = document.names?.[name];
    return typeof pubkey === 'string' && isHex64(pubkey.toLowerCase()) ? pubkey.toLowerCase() : undefined;
  } catch {
    return undefined;
  }
}
