/**
 * What a page about a Nostr event says about it, in the shape npanel takes:
 * the fields a link preview shows, the article a search engine reads, and
 * the page as schema.org describes it.
 */

import type { NostrEvent } from '@nostrify/nostrify';
import * as nip19 from 'nostr-tools/nip19';

import { drawCard } from './draw';
import { escape, renderMarkdown, renderText, safeUrl } from './html';
import { clamp, contentSource, contentText, date, eventAddress, MAX_CONTENT, parseObject, read, type Audio, type Parts, shortNpub, truncate, type Video, withoutEmoji } from './kinds';

const MAX_TITLE = 200;
const MAX_DESCRIPTION = 200;
const MAX_NAME = 100;
/** The longest a line in a profile's list of what they made is. */
const MAX_LISTED = 140;

export const APP_NAME = 'NostrHub';

/** What `preview()` returns to npanel. */
export interface Preview {
  title?: string;
  description?: string;
  body?: string;
  image?: string | Promise<Blob | null>;
  type?: string;
  twitter?: 'summary' | 'summary_large_image';
  video?: { url: string; type: string; width?: number; height?: number };
  audio?: { url: string; type: string };
  published?: number;
  /** The one URL of the several that show the same thing. */
  canonical?: string;
  jsonLd?: Record<string, unknown>;
}

/** Where the page is. */
export interface Page {
  /** The page's canonical URL, which may not be the one asked for. */
  url: string;
  origin: string;
}

/** A kind 0, as far as a preview reads it. */
export interface Profile {
  pubkey: string;
  name?: string;
  about?: string;
  picture?: string;
  website?: string;
  nip05?: string;
}

export function readProfile(event: NostrEvent | undefined, pubkey: string): Profile {
  const fields = event && event.pubkey === pubkey && event.kind === 0 ? parseObject(event.content) : {};
  const field = (key: string) => (typeof fields[key] === 'string' ? (fields[key] as string).trim() || undefined : undefined);
  // A name that's all custom emoji keeps its shortcodes: they're all it has.
  const named = field('display_name') ?? field('displayName') ?? field('name');
  const name = named && event ? withoutEmoji(named, event.tags) || named : named;
  const about = field('about');
  const nip05 = field('nip05');
  return {
    pubkey,
    name: name && clamp(name, MAX_NAME),
    about: about && truncate(about, MAX_CONTENT),
    picture: safeUrl(field('picture')),
    website: safeUrl(field('website')),
    nip05: nip05 && clamp(nip05, MAX_NAME),
  };
}

/** Their name, or a shortened npub for someone without one. */
export function displayName(profile: Profile): string {
  return profile.name ?? shortNpub(profile.pubkey);
}

function person(profile: Profile, page: Page): Record<string, unknown> {
  const npub = nip19.npubEncode(profile.pubkey);
  return withoutNulls({ '@type': 'Person', name: displayName(profile), identifier: npub, url: `${page.origin}/${npub}`, image: profile.picture });
}

/**
 * A profile's preview, from its kind 0, with links to what they've made on
 * NostrHub — NIPs, repositories, apps, articles — so a crawler that finds a
 * profile finds those from it. Its image is a card with their avatar.
 */
export function profilePreview(profile: Profile, page: Page, made: NostrEvent[] = []): Preview {
  const name = displayName(profile);
  const nip05 = profile.nip05?.replace(/^_@/, '');
  let body = `<article>\n<header>\n<h1>${escape(name)}</h1>\n`;
  if (nip05) body += `<p>${escape(nip05)}</p>\n`;
  body += '</header>\n';
  if (profile.picture) body += `<p><img src="${escape(profile.picture)}" alt="${escape(name)}"></p>\n`;
  if (profile.about) body += renderText(profile.about);
  if (profile.website) body += `<p><a href="${escape(profile.website)}" rel="me nofollow ugc">${escape(profile.website)}</a></p>\n`;
  const listed = made.filter((e) => e.pubkey === profile.pubkey).sort((a, b) => b.created_at - a.created_at).map(listItem).filter((x) => x);
  if (listed.length) body += `<section>\n<h2>On ${APP_NAME}</h2>\n<ul>\n${listed.join('')}</ul>\n</section>\n`;
  body += '</article>\n';

  const description = profile.about ? describe(withoutEmoji(profile.about, [])) : `${name} on ${APP_NAME}.`;
  return {
    title: `${name} on ${APP_NAME}`,
    description,
    body,
    image: drawCard({ label: 'Profile', title: name, subtitle: profile.about && clamp(profile.about, 200), footer: nip05, icon: profile.picture, iconShape: 'circle' }, page.origin),
    twitter: 'summary_large_image',
    type: 'profile',
    canonical: page.url,
    jsonLd: withoutNulls({ '@context': 'https://schema.org', '@type': 'ProfilePage', url: page.url, mainEntity: withoutNulls({ ...person(profile, page), description }) }),
  };
}

/**
 * A preview from what {@link read} made of an event, the profile of whoever
 * it's attributed to, and those of the others it names, where they were found.
 */
export function eventPreview(parts: Parts, profile: Profile, page: Page, people: Profile[] = []): Preview {
  const author = displayName(profile);
  const name = (pubkey: string) => (pubkey === profile.pubkey ? profile : people.find((p) => p.pubkey === pubkey))?.name;
  const named = parts.named?.(name);
  const description = describe(mapText(parts.summary ?? contentText(parts.content) ?? named?.fallback ?? parts.fallback, (text) => withoutEmoji(text, parts.emoji ?? [])));
  const style = parts.content.kind === 'markdown' ? 'article' : parts.video ? 'video' : parts.audio ? 'audio' : 'post';
  const headline = named?.title ?? parts.title;
  const title = headline ? clamp(headline, MAX_TITLE) : undefined;

  let body = '<article>\n<header>\n';
  if (parts.label) body += `<p>${escape(parts.label)}</p>\n`;
  if (title) body += `<h1>${escape(title)}</h1>\n`;
  body += `<p><a href="/${nip19.npubEncode(profile.pubkey)}" rel="author">${escape(author)}</a> · ${time(parts.published)}</p>\n`;
  body += parts.lead + '</header>\n';

  // Media an event names only in its tags is shown too; what its text, or
  // what follows it, names is shown there.
  const source = contentSource(parts.content);
  const unshown = (url: string) => !source.includes(url) && !parts.extra.includes(escape(url));
  if (parts.video && unshown(parts.video.url)) {
    const poster = parts.image ? ` poster="${escape(parts.image)}"` : '';
    body += `<p><video src="${escape(parts.video.url)}"${poster} controls preload="none"></video></p>\n`;
  } else if (parts.image && unshown(parts.image)) {
    body += `<p><img src="${escape(parts.image)}" alt=""></p>\n`;
  }
  if (parts.audio && !parts.video && unshown(parts.audio.url)) {
    body += `<p><audio src="${escape(parts.audio.url)}" controls preload="none"></audio></p>\n`;
  }
  if (parts.summary && parts.content.kind === 'markdown') body += `<p><strong>${escape(parts.summary)}</strong></p>\n`;
  switch (parts.content.kind) {
    case 'text': body += renderText(parts.content.source); break;
    case 'markdown': body += renderMarkdown(parts.content.source, parts.relative); break;
    case 'quote': body += `<blockquote>\n${renderText(parts.content.source)}</blockquote>\n`; break;
    case 'code': body += `<pre><code>${escape(parts.content.source)}</code></pre>\n`; break;
  }
  body += parts.extra + '</article>\n';

  const shownTitle = title ?? `${author} on ${APP_NAME}`;
  const published = new Date(parts.published * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
  const media = (m: Video | Audio | undefined, type: string) =>
    m && withoutNulls({ '@type': type, name: shownTitle, contentUrl: m.url, encodingFormat: m.type, uploadDate: published, thumbnailUrl: type === 'VideoObject' ? parts.image : undefined });

  // Its own picture, drawn large; else, for a kind that says what it is, a
  // card; else its author's avatar, small beside the text.
  let image: Preview['image'];
  let twitter: Preview['twitter'];
  if (parts.image) {
    image = parts.image;
    twitter = 'summary_large_image';
  } else if (parts.label) {
    image = drawCard({
      label: parts.label,
      title: shownTitle,
      subtitle: mapText(description, (d) => (d === shownTitle ? undefined : d)),
      footer: parts.context ? `${clamp(parts.context, 60)} · ${author}` : author,
      icon: parts.icon,
    }, page.origin);
    twitter = 'summary_large_image';
  } else {
    image = profile.picture;
    twitter = 'summary';
  }

  return {
    title: shownTitle,
    description,
    body,
    image,
    twitter,
    type: style === 'video' ? 'video.other' : 'article',
    video: parts.video,
    audio: parts.audio,
    published: parts.published,
    canonical: page.url,
    jsonLd: withoutNulls({
      '@context': 'https://schema.org',
      '@type': style === 'article' ? (parts.label === 'Article' ? 'Article' : 'TechArticle') : 'SocialMediaPosting',
      headline: [...(title ?? description ?? shownTitle)].slice(0, 110).join(''),
      description,
      url: page.url,
      mainEntityOfPage: page.url,
      datePublished: published,
      image: typeof image === 'string' ? image : undefined,
      video: media(parts.video, 'VideoObject'),
      audio: media(parts.audio, 'AudioObject'),
      author: person(profile, page),
    }),
  };
}

/** Something they made, in their profile's list: its label and title, linked to its page, and when. */
function listItem(event: NostrEvent): string {
  const parts = read(event);
  if (!parts) return '';
  const words = parts.title ?? mapText(parts.summary ?? contentText(parts.content) ?? parts.fallback, (text) => withoutEmoji(text, event.tags));
  const text = (words && clamp(words, MAX_LISTED)) || 'Untitled';
  const path = parts.path ?? `/${eventAddress(event)}`;
  return `<li>${parts.label ? `${escape(parts.label)}: ` : ''}<a href="${escape(path)}">${escape(text)}</a> · ${time(event.created_at)}</li>\n`;
}

function mapText(text: string | undefined, fn: (text: string) => string | undefined): string | undefined {
  return text === undefined ? undefined : fn(text);
}

/** Text cut to a description's length, on one line. */
export function describe(text: string | undefined): string | undefined {
  return text ? clamp(text, MAX_DESCRIPTION) || undefined : undefined;
}

/** A `<time>`, for a person and for a machine. */
export function time(at: number): string {
  const when = new Date(at * 1000);
  if (Number.isNaN(when.getTime())) return '';
  return `<time datetime="${when.toISOString().replace(/\.\d{3}Z$/, 'Z')}">${date(at)}</time>`;
}

export function withoutNulls<T extends Record<string, unknown>>(value: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined && v !== null));
}
