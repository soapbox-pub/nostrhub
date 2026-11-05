/**
 * Which events get a preview, and what each kind's is made of.
 *
 * Only the kinds NostrHub gives a page of their own are previewed: notes and
 * the things built on them, NIPs, articles, git repositories and what's filed
 * against them, apps, releases and plan nodes. Any other gets none, so its
 * page is served exactly as published: a guess at what an unknown event means
 * is worse than the site's own preview.
 *
 * Each kind is read the way its NIP, or NostrHub, puts things: which tag is
 * its title, which its image, and whether its content is for reading at all.
 */

import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';
import * as nip19 from 'nostr-tools/nip19';

import { audioType, escape, markdownText, mediaKind, mimeKind, safeUrl, urls, videoType } from './html';

/** The most of an event's content that is read. A long article is cut here rather than left out. */
export const MAX_CONTENT = 128 * 1024;
/** The most entries a list on the page shows. */
const MAX_LIST = 50;

export const ARTICLE_KIND = 30023;
export const CUSTOM_NIP_KIND = 30817;
export const REPO_KIND = 30617;
export const REPO_STATE_KIND = 30618;
export const PATCH_KIND = 1617;
export const PR_KIND = 1618;
export const PR_UPDATE_KIND = 1619;
export const ISSUE_KIND = 1621;
export const STATUS_KINDS = [1630, 1631, 1632, 1633];
export const APP_KIND = 31990;
export const ZAPSTORE_APP_KIND = 32267;
export const RELEASE_KIND = 30063;
export const PLAN_NODE_KIND = 32473;
export const CHAT_KIND = 9;
export const COMMENT_KIND = 1111;
export const HIGHLIGHT_KIND = 9802;

/** Every kind with a preview. {@link read} answers for each but 0, which is a profile, and for nothing else. */
export const SUPPORTED: readonly number[] = [
  0, 1, CHAT_KIND, 11, COMMENT_KIND, PATCH_KIND, PR_KIND, PR_UPDATE_KIND, ISSUE_KIND, ...STATUS_KINDS, HIGHLIGHT_KIND,
  ARTICLE_KIND, RELEASE_KIND, REPO_KIND, REPO_STATE_KIND, CUSTOM_NIP_KIND, APP_KIND, ZAPSTORE_APP_KIND, PLAN_NODE_KIND,
];

/** The canonical origin NostrHub's chat channels are scoped to (`src/lib/chat.ts`). */
const CHAT_ORIGIN = 'https://nostrhub.io';

export interface Video {
  url: string;
  type: string;
  width?: number;
  height?: number;
}

export interface Audio {
  url: string;
  type: string;
}

/** How an event's content is shown. */
export type Content =
  | { kind: 'text' | 'markdown' | 'quote' | 'code'; source: string }
  /** Nothing to read: JSON, or empty. */
  | { kind: 'hidden' };

const text = (source: string): Content => ({ kind: 'text', source });
const markdown = (source: string): Content => ({ kind: 'markdown', source });
const HIDDEN: Content = { kind: 'hidden' };

/** What content was made from, to tell whether media is already shown in it. */
export function contentSource(content: Content): string {
  return content.kind === 'hidden' ? '' : content.source;
}

/**
 * Text without the custom emoji (NIP-30) an event's or a profile's `emoji`
 * tags define: drawn as images in the app, they're only `:shortcodes:` in a
 * title or a description.
 */
export function withoutEmoji(text: string, tags: string[][]): string {
  const codes = new Set(tags.filter(([name, code]) => name === 'emoji' && code).map(([, code]) => code));
  if (!codes.size) return text;
  return text
    .replace(/[\u200B\uFEFF]*:([\w-]+):[\u200B\uFEFF]*/g, (whole, code: string) => (codes.has(code) ? ' ' : whole))
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/** Content's words, for a description, if it has any worth one. */
export function contentText(content: Content): string | undefined {
  let words: string;
  switch (content.kind) {
    case 'text':
    case 'quote':
      words = withoutReferences(content.source);
      break;
    case 'markdown':
      words = markdownText(content.source);
      break;
    default:
      return undefined;
  }
  return words.trim() ? words : undefined;
}

/** What an event's preview is made of, before its author's profile is known. */
export interface Parts {
  /** Who it's attributed to. */
  author: string;
  published: number;
  title?: string;
  /** The description, where the event has one apart from its content. */
  summary?: string;
  /** The description when neither the summary nor the content gives one. */
  fallback?: string;
  /** A picture of its own, drawn large. */
  image?: string;
  /** An icon or logo, drawn small on the card beside its title. */
  icon?: string;
  video?: Video;
  audio?: Audio;
  content: Content;
  /**
   * What it is, as the card above its title says: "Custom NIP", "Issue". A
   * kind with a label gets a card drawn when it has no picture of its own;
   * one without shows its author's avatar.
   */
  label?: string;
  /** Where it belongs, as the card's last line says: a repository's name. Its author's name when missing. */
  context?: string;
  /** Markup for the article's header, below the byline. Already escaped. */
  lead: string;
  /** Markup for after the content. Already escaped. */
  extra: string;
  /** Its `emoji` tags, whose `:shortcodes:` a description leaves out. */
  emoji?: string[][];
  /** Others it names, beside its author: their profiles are fetched for {@link named}. */
  people?: string[];
  /** Its title and fallback once people's names are known: "Alex closed “Fix the build”". */
  named?: (name: Name) => { title?: string; fallback?: string };
  /** The site's own path for it, where that isn't its NIP-19 address. */
  path?: string;
  /** Rewrites a relative link in its Markdown to a path on the site. */
  relative?: (url: string) => string | undefined;
}

/** Someone's name, if their profile gives one. */
export type Name = (pubkey: string) => string | undefined;

/** Someone's name, or a shortened npub for someone without one. */
export function who(name: Name, pubkey: string): string {
  return name(pubkey) ?? shortNpub(pubkey);
}

/**
 * Where the event another is about is found, for the kinds whose preview is
 * made of it: what was commented on, closed or updated, the repository an
 * issue is filed against, the app a release is of.
 */
export function reference(e: NostrEvent): NostrFilter | undefined {
  switch (e.kind) {
    case 1630: case 1631: case 1632: case 1633: {
      const ids = all(e, 'e');
      const id = (ids.find((t) => t[2] === 'root') ?? ids[0])?.[0];
      return isHex64(id) ? { ids: [id] } : undefined;
    }
    case PR_UPDATE_KIND: {
      const id = tag(e, 'E') ?? tag(e, 'e');
      return isHex64(id) ? { ids: [id] } : undefined;
    }
    case PATCH_KIND: case PR_KIND: case ISSUE_KIND:
      return address(e, 'a', REPO_KIND);
    case COMMENT_KIND: {
      const id = tag(e, 'E');
      return isHex64(id) ? { ids: [id] } : address(e, 'A');
    }
    case RELEASE_KIND: {
      const app = address(e, 'a', ZAPSTORE_APP_KIND);
      if (app) return app;
      const identifier = tag(e, 'i');
      return identifier ? { kinds: [ZAPSTORE_APP_KIND], authors: [e.pubkey], '#d': [identifier] } : undefined;
    }
    default:
      return undefined;
  }
}

/** A filter for the addressable event a tag names: of the kind given, or any. */
function address(e: NostrEvent, name: string, kind?: number): NostrFilter | undefined {
  for (const [a] of all(e, name)) {
    const parsed = parseAddress(a);
    if (parsed && (kind === undefined || parsed.kind === kind)) {
      return { kinds: [parsed.kind], authors: [parsed.pubkey], '#d': [parsed.identifier] };
    }
  }
  return undefined;
}

/** `<kind>:<pubkey>:<d>`, for an addressable kind. */
export function parseAddress(a: string | undefined): { kind: number; pubkey: string; identifier: string } | undefined {
  const [kindText, pubkey, ...rest] = a?.split(':') ?? [];
  const kind = Number(kindText);
  if (!/^\d+$/.test(kindText ?? '') || kind < 30000 || kind >= 40000 || !isHex64(pubkey)) return undefined;
  return { kind, pubkey, identifier: rest.join(':') };
}

/** What a preview says of the event another is about. */
interface About {
  author: string;
  title?: string;
  text?: string;
  image?: string;
  label?: string;
  path?: string;
}

function about(ref: NostrEvent | undefined, kinds?: number[]): About | undefined {
  if (!ref || (kinds && !kinds.includes(ref.kind))) return undefined;
  const parts = read(ref);
  if (!parts) return undefined;
  const text = mapOpt(parts.summary ?? contentText(parts.content) ?? parts.fallback, (t) => withoutEmoji(t, parts.emoji ?? []) || undefined);
  return { author: parts.author, title: parts.title, text, image: parts.image, label: parts.label, path: parts.path ?? `/${eventAddress(ref)}` };
}

/** The event another is about, as a title names it: “Its title”, or whose post it is. */
function label(of: About, name: Name): string {
  return of.title ? `“${clamp(of.title, 80)}”` : `${who(name, of.author)}'s ${of.label?.toLowerCase() ?? 'post'}`;
}

/** Adds to what {@link Parts.named} gives. */
function naming(p: Parts, fn: (name: Name) => { title?: string; fallback?: string }): void {
  const before = p.named;
  p.named = (n) => ({ ...before?.(n), ...fn(n) });
}

/**
 * An event's parts, or undefined for a kind that isn't previewed — or one
 * that is, but malformed in a way NostrHub would refuse to show. `ref` is the
 * event {@link reference} names, where it was found.
 */
export function read(e: NostrEvent, ref?: NostrEvent): Parts | undefined {
  const content = truncate(e.content, MAX_CONTENT);
  const media = mediaOf(e, content);
  const p: Parts = {
    author: e.pubkey,
    published: e.created_at,
    title: tag(e, 'title'),
    summary: tag(e, 'summary') ?? tag(e, 'description'),
    // NIP-31: an `alt` describes an event its content doesn't.
    fallback: tag(e, 'alt'),
    image: urlTag(e, 'image') ?? urlTag(e, 'thumb') ?? media.image,
    video: media.video,
    audio: media.audio,
    content: text(content),
    lead: '',
    extra: '',
    emoji: e.tags.filter(([name]) => name === 'emoji'),
  };

  switch (e.kind) {
    case 1: case 11:
      break;
    case CHAT_KIND: chat(p, e); break;
    case COMMENT_KIND: comment(p, e, ref); break;
    case HIGHLIGHT_KIND: highlight(p, e, content); break;
    case ARTICLE_KIND:
      p.label = 'Article';
      p.content = markdown(content);
      p.published = publishedAt(e) ?? p.published;
      break;
    case CUSTOM_NIP_KIND: if (!customNip(p, e, content)) return undefined; break;
    case REPO_KIND: repository(p, e); break;
    case REPO_STATE_KIND: repositoryState(p, e); break;
    case PATCH_KIND: patch(p, e, content, ref); break;
    case PR_KIND: case ISSUE_KIND: ticket(p, e, content, ref); break;
    case PR_UPDATE_KIND: prUpdate(p, e, ref); break;
    case 1630: case 1631: case 1632: case 1633: gitStatus(p, e, ref); break;
    case APP_KIND: if (!app(p, e, content)) return undefined; break;
    case ZAPSTORE_APP_KIND: if (!zapstoreApp(p, e, content)) return undefined; break;
    case RELEASE_KIND: if (!release(p, e, content, ref)) return undefined; break;
    case PLAN_NODE_KIND: if (!planNode(p, e, content)) return undefined; break;
    default:
      return undefined;
  }

  // A Markdown event's summary is written in Markdown too.
  if (p.content.kind === 'markdown' && p.summary) p.summary = markdownText(p.summary).replace(/\s+/g, ' ').trim() || undefined;

  // NIP-36: what its author put behind a warning stays behind one. A preview
  // has no way to ask first, so it shows none of it.
  if (e.tags.some(([name]) => name === 'content-warning')) {
    const reason = tag(e, 'content-warning');
    p.summary = reason ? `Content warning: ${reason}` : 'Content warning';
    p.image = undefined;
    p.video = undefined;
    p.audio = undefined;
    p.content = HIDDEN;
    p.extra = '';
  }
  return p;
}

function chat(p: Parts, e: NostrEvent): void {
  // NIP-C7 messages are scoped to a channel by the URL NostrHub names it by.
  const url = tag(e, 'i');
  const topic = url?.startsWith(`${CHAT_ORIGIN}/chat/`) ? url.slice(`${CHAT_ORIGIN}/chat/`.length) : undefined;
  if (topic && /^[\w-]+$/.test(topic)) {
    p.lead = paragraph(`In <a href="/chat/${escape(topic)}">#${escape(topic)}</a>`);
    naming(p, (name) => ({ title: `${who(name, e.pubkey)} in #${topic}` }));
  }
}

function comment(p: Parts, e: NostrEvent, ref: NostrEvent | undefined): void {
  // What was commented on, by its title, where it was found; or an official
  // NIP or BUD, which NIP-22 names by its URL.
  const of = about(ref);
  if (of) {
    p.lead = paragraph(`On <a href="${escape(of.path ?? '')}">${escape(of.title ? clamp(of.title, 120) : of.label ?? 'a post')}</a>`);
    p.people = [of.author];
    p.context = of.title;
    naming(p, (name) => ({ title: `${who(name, e.pubkey)} commented on ${label(of, name)}` }));
    return;
  }
  const spec = mapOpt(safeUrl(tag(e, 'I')), nipLabel);
  if (spec) {
    p.lead = paragraph(`On <a href="/${spec.startsWith('NIP-') ? 'nip' : 'bud'}/${spec.slice(4)}">${spec}</a>`);
    p.context = spec;
  }
  naming(p, (name) => ({ title: `${who(name, e.pubkey)} commented${spec ? ` on ${spec}` : ''}` }));
}

function highlight(p: Parts, e: NostrEvent, content: string): void {
  p.content = { kind: 'quote', source: content };
  const remark = tag(e, 'comment');
  if (remark) p.extra = paragraph(escape(remark));
  // Where it is from: a URL, marked `source` by preference, then an event.
  const sources = all(e, 'r').filter((t) => t[1] !== 'mention');
  const url = safeUrl((sources.find((t) => t[1] === 'source') ?? sources[0])?.[0]);
  const from = (url && webLink(url, nipLabel(url) ?? url)) ?? coordinate(e) ?? target(e);
  if (from) p.extra += paragraph(`From ${from}`);
  p.summary = mapOpt(contentText(p.content), (t) => `“${clamp(t, 180)}”`);
  p.fallback = remark;
  p.label = 'Highlight';
  const source = url ? nipLabel(url) ?? `a passage from ${new URL(url).hostname.replace(/^www\./, '')}` : undefined;
  naming(p, (name) => ({ title: `${who(name, e.pubkey)} highlighted ${source ?? 'a passage'}` }));
}

/** `NIP-23` for a link to an official NIP on GitHub, `BUD-01` for a BUD's. */
function nipLabel(url: string): string | undefined {
  const nip = /^https:\/\/github\.com\/nostr-protocol\/nips\/blob\/[^/]+\/([0-9A-F]{2})\.md/i.exec(url);
  if (nip) return `NIP-${nip[1].toUpperCase()}`;
  const bud = /^https:\/\/github\.com\/hzrd149\/blossom\/blob\/[^/]+\/buds\/([0-9a-z]{2})\.md/i.exec(url);
  return bud ? `BUD-${bud[1]}` : undefined;
}

function customNip(p: Parts, e: NostrEvent, content: string): boolean {
  // NostrHub shows no NIP without a `d` and a title.
  if (!tag(e, 'd') || !p.title) return false;
  const review = tag(e, 'status') === 'review';
  p.label = review ? 'NIP draft for review' : 'Custom NIP';
  p.content = markdown(content);
  p.image = undefined;
  p.video = undefined;
  p.audio = undefined;
  p.fallback = 'A community NIP on NostrHub';
  p.path = `/${nip19.naddrEncode({ kind: CUSTOM_NIP_KIND, pubkey: e.pubkey, identifier: tag(e, 'd')! })}`;

  const facts: string[] = [];
  if (review) facts.push('A draft whose author is asking for feedback');
  const fork = forkOf(e);
  if (fork) facts.push(`Forked from ${fork}`);
  if (facts.length) p.lead = paragraph(facts.join(' · '));

  const kinds = all(e, 'k').filter((t) => /^\d+$/.test(t[0] ?? ''));
  if (kinds.length) {
    const items = kinds.map(([kind, name]) => `<a href="/k/${kind}">Kind ${kind}</a>${name?.trim() ? `: ${escape(name.trim())}` : ''}`);
    p.extra = `<h2>Event kinds</h2>\n${list(items, items.length)}`;
  }
  return true;
}

/** What a NIP was forked from, linked: an official NIP, a BUD, or another custom NIP. */
function forkOf(e: NostrEvent): string | undefined {
  const official = e.tags.find(([n, , marker]) => n === 'i' && marker === 'fork')?.[1];
  if (official) {
    const nip = nipLabel(official);
    if (nip?.startsWith('NIP-')) return `<a href="/nip/${nip.slice(4)}">${nip}</a>`;
    if (nip?.startsWith('BUD-')) return `<a href="/bud/${nip.slice(4)}">${nip}</a>`;
    const url = safeUrl(official);
    return url ? webLink(url, url) : undefined;
  }
  const custom = e.tags.find(([n, , , marker]) => n === 'a' && marker === 'fork')?.[1];
  const parsed = parseAddress(custom);
  if (parsed?.kind !== CUSTOM_NIP_KIND) return undefined;
  return `<a href="/${nip19.naddrEncode(parsed)}">${escape(parsed.identifier || 'a NIP')}</a>`;
}

/** The path NostrHub gives a repository: `/<npub>/<d>`. */
export function repoPath(pubkey: string, identifier: string): string {
  return `/${nip19.npubEncode(pubkey)}/${encodeURIComponent(identifier)}`;
}

function repository(p: Parts, e: NostrEvent): void {
  const d = tag(e, 'd') ?? '';
  p.title = tag(e, 'name') ?? d;
  p.label = 'Repository';
  p.content = HIDDEN;
  p.image = undefined;
  p.fallback = `${p.title}: a git repository announced on Nostr`;
  p.path = repoPath(e.pubkey, d);
  // NIP-34 puts several URLs in one tag.
  const links = [...new Set(every(e, 'web').map((u) => safeUrl(u)).filter((u): u is string => !!u))];
  const clones = [...new Set(every(e, 'clone'))].filter((u) => /^https?:\/\//.test(u));
  let extra = '';
  if (links.length) extra += list(links.map((u) => webLink(u, u)), links.length);
  if (clones.length) extra += `<h2>Clone</h2>\n${list(clones.map((u) => `<code>${escape(u.trim())}</code>`), clones.length)}`;
  const maintainers = [...new Set(every(e, 'maintainers'))]
    .filter((pk) => isHex64(pk) && pk !== e.pubkey);
  if (maintainers.length) extra += `<h2>Maintainers</h2>\n${list(maintainers.map(personLink), maintainers.length)}`;
  p.extra = extra;
  const topics = [...new Set(values(e, 't'))];
  if (topics.length) p.lead = paragraph(topics.map((t) => `#${escape(t)}`).join(' '));
}

function repositoryState(p: Parts, e: NostrEvent): void {
  const d = tag(e, 'd') ?? '';
  const branches = e.tags.filter(([name]) => name?.startsWith('refs/heads/')).length;
  p.title = d;
  p.label = 'Repository';
  p.fallback = count(branches, 'branch', 'branches');
  p.content = HIDDEN;
  p.path = repoPath(e.pubkey, d);
}

/** The repository an issue, a pull request or a patch is filed against, as its page links it. */
function repoOf(p: Parts, e: NostrEvent, ref: NostrEvent | undefined): void {
  const named = parseAddress(all(e, 'a').map((t) => t[0]).find((a) => a?.startsWith(`${REPO_KIND}:`)));
  if (!named) return;
  const repo = ref?.kind === REPO_KIND && ref.pubkey === named.pubkey && tag(ref, 'd') === named.identifier ? ref : undefined;
  const name = (repo && tag(repo, 'name')) ?? named.identifier;
  p.context = name;
  p.lead = paragraph(`In <a href="${escape(repoPath(named.pubkey, named.identifier))}">${escape(name)}</a>`) + p.lead;
}

function patch(p: Parts, e: NostrEvent, content: string, ref: NostrEvent | undefined): void {
  // `git format-patch` writes the subject as a header.
  const lines = content.split('\n');
  const header = lines.find((line) => line.startsWith('Subject:'))?.slice('Subject:'.length);
  const subject = header ?? lines.map((l) => l.trim()).find(Boolean);
  const stripped = subject !== undefined ? stripPatchPrefix(subject.trim()) : undefined;
  p.title = tag(e, 'subject') ?? (stripped ? clamp(stripped, 160) : undefined);
  p.label = 'Patch';
  // Its commit message: after the headers' blank line, before the diffstat.
  const start = lines.findIndex((line) => line.startsWith('Subject:'));
  if (start >= 0) {
    const rest = lines.slice(start + 1);
    const blank = rest.findIndex((line) => !line.trim());
    const end = rest.findIndex((line) => line === '---' || line.startsWith('diff --git'));
    const message = blank < 0 ? '' : rest.slice(blank + 1, end < 0 ? undefined : end).join('\n').trim();
    if (message) p.summary = message;
  }
  p.fallback = 'A patch';
  p.image = undefined;
  p.video = undefined;
  p.audio = undefined;
  p.content = { kind: 'code', source: content };
  repoOf(p, e, ref);
  // What it changes, as its diffstat sums it up.
  const stat = lines.map((l) => l.trim()).find((l) => /^\d+ files? changed/.test(l));
  const to = p.context ? `A patch to ${p.context}` : 'A patch';
  p.fallback = stat ? `${to}: ${stat}` : to;
}

/** A subject without its `[PATCH v2 1/3]`. */
function stripPatchPrefix(subject: string): string {
  const match = /^\[([^\]]*)\](.*)$/s.exec(subject);
  return match && match[1].toUpperCase().includes('PATCH') ? match[2].trim() : subject;
}

function ticket(p: Parts, e: NostrEvent, content: string, ref: NostrEvent | undefined): void {
  const firstLine = content.split('\n').map((l) => l.trim().replace(/^#+/, '').trim()).find(Boolean);
  p.title = tag(e, 'subject') ?? mapOpt(firstLine, (l) => clamp(l, 120));
  p.content = markdown(content);
  p.label = e.kind === PR_KIND ? 'Pull request' : 'Issue';
  p.fallback = e.kind === PR_KIND ? 'A pull request' : 'An issue';
  const labels = [...new Set(values(e, 't').map((t) => t.toLowerCase()))];
  if (labels.length) p.lead = paragraph(labels.map((t) => `#${escape(t)}`).join(' '));
  repoOf(p, e, ref);
}

function prUpdate(p: Parts, e: NostrEvent, ref: NostrEvent | undefined): void {
  p.label = 'Pull request update';
  p.fallback = 'A pull request update';
  p.content = HIDDEN;
  const pr = about(ref, [PR_KIND]);
  if (pr) {
    p.lead = paragraph(`Updated <a href="${escape(pr.path ?? '')}">${escape(pr.title ? clamp(pr.title, 120) : 'a pull request')}</a>`);
    p.context = pr.title;
    p.fallback = pr.text ?? p.fallback;
  }
  naming(p, (name) => ({ title: `${who(name, e.pubkey)} updated ${pr?.title ? `“${clamp(pr.title, 120)}”` : 'a pull request'}` }));
}

function gitStatus(p: Parts, e: NostrEvent, ref: NostrEvent | undefined): void {
  p.title = ({ 1630: 'Reopened', 1631: 'Merged', 1632: 'Closed' } as Record<number, string>)[e.kind] ?? 'Marked as a draft';
  p.label = 'Status change';
  p.content = HIDDEN;
  // What was closed or merged, by its subject.
  const of = about(ref, [PATCH_KIND, PR_KIND, ISSUE_KIND]);
  if (!of) return;
  p.lead = paragraph(`On <a href="${escape(of.path ?? '')}">${escape(of.title ? clamp(of.title, 120) : of.label ?? 'a ticket')}</a>`);
  if (!of.title) return;
  const subject = `“${clamp(of.title, 120)}”`;
  const did = e.kind === 1630 ? `reopened ${subject}`
    : e.kind === 1631 ? `${ref?.kind === ISSUE_KIND ? 'resolved' : 'merged'} ${subject}`
    : e.kind === 1632 ? `closed ${subject}`
    : `marked ${subject} as a draft`;
  p.fallback = of.text;
  naming(p, (name) => ({ title: `${who(name, e.pubkey)} ${did}` }));
}

const PLATFORMS: Record<string, string> = {
  web: 'Web', ios: 'iOS', android: 'Android', desktop: 'Desktop', linux: 'Linux', macos: 'macOS', windows: 'Windows',
};

function app(p: Parts, e: NostrEvent, content: string): boolean {
  const d = tag(e, 'd');
  if (!d) return false;
  // A NIP-89 handler's content is a kind 0's.
  const fields = parseObject(content);
  const field = (key: string) => (typeof fields[key] === 'string' ? (fields[key] as string).trim() || undefined : undefined);
  p.title = field('name') ?? field('display_name') ?? d;
  p.label = 'App';
  p.summary = field('about');
  p.fallback = 'A Nostr app listed on NostrHub';
  p.icon = safeUrl(field('picture'));
  p.image = undefined;
  p.content = HIDDEN;

  const platforms = [...new Set(e.tags.map(([name]) => PLATFORMS[name]).filter((x): x is string => !!x))];
  if (platforms.length) p.lead = paragraph(escape(platforms.join(' · ')));
  let extra = '';
  const website = safeUrl(field('website'));
  if (website) extra += paragraph(webLink(website, website));

  const kinds = [...new Set(values(e, 'k').filter((k) => /^\d+$/.test(k)).map(Number))].sort((a, b) => a - b);
  if (kinds.length) extra += `<h2>Event kinds</h2>\n${list(kinds.map((k) => `<a href="/k/${k}">Kind ${k}</a>`), kinds.length)}`;

  const nips = new Set<string>();
  for (const [name, value, marker] of e.tags) {
    if (name !== 'i' || !value) continue;
    if (marker === 'nip') nips.add(`NIP-${value.replace(/^nip-/i, '').padStart(2, '0').toUpperCase()}`);
    else if (marker === 'bud') nips.add(`BUD-${value.replace(/^bud-/i, '').padStart(2, '0')}`);
    else {
      const found = nipLabel(value);
      if (found) nips.add(found);
    }
  }
  if (nips.size) {
    const items = [...nips].map((n) => `<a href="/${n.startsWith('NIP-') ? 'nip' : 'bud'}/${n.slice(4)}">${n}</a>`);
    extra += `<h2>Implements</h2>\n${list(items, items.length)}`;
  }
  p.extra = extra;
  return true;
}

function zapstoreApp(p: Parts, e: NostrEvent, content: string): boolean {
  const d = tag(e, 'd');
  if (!d) return false;
  p.title = tag(e, 'name') ?? d;
  p.label = 'App on Zapstore';
  p.summary = tag(e, 'summary');
  p.icon = urlTag(e, 'icon');
  p.image = urlTag(e, 'image') ?? urlTag(e, 'banner');
  p.content = markdown(content);
  p.fallback = 'A software release on Zapstore';
  const links = ['url', 'repository'].map((name) => urlTag(e, name)).filter((u): u is string => !!u).map((u) => webLink(u, u));
  p.extra = list(links, links.length);
  return true;
}

function release(p: Parts, e: NostrEvent, content: string, ref: NostrEvent | undefined): boolean {
  const d = tag(e, 'd');
  const identifier = tag(e, 'i');
  const version = tag(e, 'version');
  if (!d || !(identifier || version)) return false;
  const listing = ref?.kind === ZAPSTORE_APP_KIND ? ref : undefined;
  const name = (listing && tag(listing, 'name')) ?? identifier ?? d.split('@')[0];
  p.title = version ? `${name} ${version}` : name;
  p.label = 'Release';
  p.icon = listing && urlTag(listing, 'icon');
  p.image = undefined;
  p.content = markdown(content);
  p.fallback = listing ? tag(listing, 'summary') ?? 'A software release on Zapstore' : 'A software release on Zapstore';
  const channel = tag(e, 'c');
  if (channel && channel !== 'main') p.lead = paragraph(`${escape(channel)} channel`);
  if (listing) {
    const at = nip19.naddrEncode({ kind: ZAPSTORE_APP_KIND, pubkey: listing.pubkey, identifier: tag(listing, 'd') ?? '' });
    p.lead = paragraph(`A release of <a href="/${at}">${escape(name)}</a>`) + p.lead;
    p.context = name;
  }
  return true;
}

const NODE_TYPES: Record<string, string> = {
  goal: 'Goal', problem: 'Problem', task: 'Task', person: 'Person', org: 'Organization', concept: 'Concept', object: 'Object',
};
const NODE_STATUSES: Record<string, string> = {
  open: 'Open', 'in-progress': 'In progress', blocked: 'Blocked', done: 'Done', dropped: 'Dropped',
};

function planNode(p: Parts, e: NostrEvent, content: string): boolean {
  const type = NODE_TYPES[tag(e, 'type') ?? ''];
  if (!e.tags.some(([n]) => n === 'd')) return false;
  if (!p.title || !type) return false;
  const status = NODE_STATUSES[tag(e, 'status') ?? 'open'] ?? 'Open';
  const entity = ['Person', 'Organization', 'Concept', 'Object'].includes(type);
  p.label = entity ? `Plan · ${type}` : `Plan · ${type} · ${status}`;
  p.content = markdown(content);
  p.image = undefined;
  p.fallback = `A ${type.toLowerCase()} on the NostrHub plan`;
  const topics = [...new Set(values(e, 't'))];
  if (topics.length) p.lead = paragraph(topics.map((t) => `#${escape(t)}`).join(' '));
  return true;
}

/** The first image, video and audio an event carries: from its NIP-92 `imeta` tags, then URLs in its text. */
function mediaOf(e: NostrEvent, content: string): { image?: string; video?: Video; audio?: Audio } {
  const media: { image?: string; video?: Video; audio?: Audio } = {};
  let thumbnail: string | undefined;

  for (const entries of all(e, 'imeta')) {
    const url = safeUrl(field(entries, 'url'));
    if (!url) continue;
    const mime = field(entries, 'm') ?? '';
    const kind = mimeKind(mime) ?? mediaKind(url);
    if (kind === 'image' && !media.image) {
      media.image = url;
    } else if (kind === 'video' && !media.video) {
      const [width, height] = dimensions(field(entries, 'dim'));
      thumbnail ??= safeUrl(field(entries, 'image') ?? field(entries, 'thumb'));
      media.video = { url, type: mimeKind(mime) === 'video' ? mime : videoType(url), width, height };
    } else if (kind === 'audio' && !media.audio) {
      media.audio = { url, type: mimeKind(mime) === 'audio' ? mime : audioType(url) };
    }
  }

  for (const raw of urls(content)) {
    const url = safeUrl(raw);
    if (!url) continue;
    const kind = mediaKind(url);
    if (kind === 'image' && !media.image) media.image = url;
    else if (kind === 'video' && !media.video) media.video = { url, type: videoType(url) };
    else if (kind === 'audio' && !media.audio) media.audio = { url, type: audioType(url) };
  }

  media.image ??= thumbnail;
  return media;
}

/** `WxH`, as `imeta` writes a size. */
function dimensions(dim: string | undefined): [number | undefined, number | undefined] {
  const match = dim && /^\s*(\d+)\s*x\s*(\d+)\s*$/.exec(dim);
  if (!match) return [undefined, undefined];
  const [w, h] = [Number(match[1]), Number(match[2])];
  return [w > 0 ? w : undefined, h > 0 ? h : undefined];
}

/** A note's text as a description: without the media and `nostr:` references it carries, which say nothing in a preview. */
function withoutReferences(content: string): string {
  let out = content;
  for (const url of urls(content)) {
    if (/^nostr:/i.test(url) || mapOpt(safeUrl(url), mediaKind)) out = out.replace(url, ' ');
  }
  return out;
}

// ─── Tags ─────────────────────────────────────────────────────────────

/** The first tag of a name's value, when it has a non-empty one. */
export function tag(e: NostrEvent, name: string): string | undefined {
  return e.tags.find(([n]) => n === name)?.[1]?.trim() || undefined;
}

/** A tag's URL, if it is one a page may load. */
function urlTag(e: NostrEvent, name: string): string | undefined {
  return safeUrl(tag(e, name));
}

/** Every tag of a name, each without it. */
function all(e: NostrEvent, name: string): string[][] {
  return e.tags.filter(([n]) => n === name).map((t) => t.slice(1));
}

/** Every non-empty value of every tag of a name, in all its places. */
function every(e: NostrEvent, name: string): string[] {
  return all(e, name).flat().map((v) => v.trim()).filter(Boolean);
}

/** Every non-empty value of a tag's name. */
function values(e: NostrEvent, name: string): string[] {
  return all(e, name).map((t) => t[0]?.trim() ?? '').filter(Boolean);
}

/** An `imeta`-style entry, `key value`. */
function field(entries: string[], key: string): string | undefined {
  for (const entry of entries) {
    if (entry.startsWith(`${key} `)) {
      const value = entry.slice(key.length + 1).trim();
      if (value) return value;
    }
  }
  return undefined;
}

function publishedAt(e: NostrEvent): number | undefined {
  const at = tag(e, 'published_at');
  return at && /^\d+$/.test(at) && Number(at) > 0 ? Number(at) : undefined;
}

/** The event an event is about, by its last `e` tag, linked to its page on the same site. */
function target(e: NostrEvent): string | undefined {
  const id = all(e, 'e').map((t) => t[0]).filter(isHex64).pop();
  return id ? `<a href="/${nip19.neventEncode({ id })}">a post</a>` : undefined;
}

/** The address an event is about, by its `a` tag, linked the same way. */
function coordinate(e: NostrEvent): string | undefined {
  const parsed = parseAddress(all(e, 'a').map((t) => t[0]).find((v) => v !== undefined));
  if (!parsed) return undefined;
  return `<a href="/${nip19.naddrEncode(parsed)}">${parsed.identifier ? escape(parsed.identifier) : 'this'}</a>`;
}

/** The address NostrHub links an event by: an naddr for an addressable event, an nevent for the rest. */
export function eventAddress(e: NostrEvent): string {
  if (e.kind >= 30000 && e.kind < 40000) {
    return nip19.naddrEncode({ kind: e.kind, pubkey: e.pubkey, identifier: e.tags.find(([n]) => n === 'd')?.[1] ?? '' });
  }
  return nip19.neventEncode({ id: e.id, author: e.pubkey, kind: e.kind });
}

export function personLink(pubkey: string): string {
  return `<a href="/${nip19.npubEncode(pubkey)}">@${escape(shortNpub(pubkey))}</a>`;
}

/** An npub, shortened, for someone with no name. */
export function shortNpub(pubkey: string): string {
  const npub = nip19.npubEncode(pubkey);
  return `${npub.slice(0, 12)}…${npub.slice(-4)}`;
}

export function webLink(url: string, label: string): string {
  return `<a href="${escape(url)}" rel="nofollow ugc">${escape(label)}</a>`;
}

/** Markup in a paragraph. The caller has escaped it. */
export function paragraph(html: string): string {
  return `<p>${html}</p>\n`;
}

/** Items in a list, at most {@link MAX_LIST} of the `total`, each markup the caller has escaped. */
export function list(items: string[], total: number): string {
  const shown = items.slice(0, MAX_LIST);
  if (!shown.length) return '';
  let out = '<ul>\n' + shown.map((item) => `<li>${item}</li>\n`).join('');
  if (total > shown.length) out += `<li>and ${thousands(total - shown.length)} more</li>\n`;
  return out + '</ul>\n';
}

function count(n: number, one: string, many: string): string {
  return `${thousands(n)} ${n === 1 ? one : many}`;
}

/** `1234567` as `1,234,567`. */
function thousands(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** A day, as `June 1, 2025`, in UTC. npanel's sandbox has no `Intl` to format one by. */
export function date(seconds: number): string {
  const at = new Date(seconds * 1000);
  return `${MONTHS[at.getUTCMonth()]} ${at.getUTCDate()}, ${at.getUTCFullYear()}`;
}

export function isHex64(value: string | undefined): value is string {
  return !!value && /^[0-9a-f]{64}$/.test(value);
}

/** At most `max` UTF-16 units of `text`, never splitting a surrogate pair. */
export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const end = /[\uD800-\uDBFF]/.test(text[max - 1]) ? max - 1 : max;
  return text.slice(0, end);
}

/** Text on one line, cut to `max` characters at a word where it can be, with an ellipsis. */
export function clamp(value: string, max: number): string {
  const words = value.split(/\s+/).filter(Boolean).join(' ');
  const chars = [...words];
  if (chars.length <= max) return words;
  const cut = chars.slice(0, max).join('');
  const space = cut.lastIndexOf(' ');
  const kept = space >= 0 && [...cut.slice(0, space)].length > max * 0.6 ? cut.slice(0, space) : cut;
  return `${kept.trimEnd()}…`;
}

export function parseObject(json: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(json);
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

export function mapOpt<T, U>(value: T | undefined, fn: (value: T) => U | undefined): U | undefined {
  return value === undefined ? undefined : fn(value);
}
