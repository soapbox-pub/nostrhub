import { nip19 } from 'nostr-tools';
import type { NostrEvent } from '@nostrify/nostrify';

/** NIP-34 git repository announcement. */
export const GIT_REPO_KIND = 30617;
/** NIP-34 git repository state announcement (branches/tags). */
export const GIT_STATE_KIND = 30618;

/**
 * Well-known GRASP servers (relays that double as git smart-HTTP hosts).
 * Used as extra discovery relays when fetching git events, since the user's
 * general read relays often don't carry NIP-34 traffic.
 */
export const GIT_DISCOVERY_RELAYS: string[] = [
  'wss://relay.ngit.dev/',
  'wss://git.shakespeare.diy/',
];

/** A git ref (branch or tag) from a kind 30618 state event. */
export interface GitRef {
  /** Short name, e.g. `main` or `v1.0.0`. */
  name: string;
  /** Full commit id the ref points at. */
  commit: string;
}

/** Parsed kind 30617 repository announcement. */
export interface GitRepoAnnouncement {
  event: NostrEvent;
  pubkey: string;
  /** The `d` tag — kebab-case repo id. */
  identifier: string;
  /** Human-readable name; falls back to the identifier. */
  name: string;
  description?: string;
  /** Browse URLs (https only, sanitized). */
  webUrls: string[];
  /** Git clone URLs (https only, sanitized). */
  cloneUrls: string[];
  /** Relays monitoring this repository (ws/wss only). */
  relays: string[];
  /** Other recognized maintainers (valid hex pubkeys, excluding the owner). */
  maintainers: string[];
  /** `t` hashtags. */
  hashtags: string[];
  /** Earliest unique commit id (`["r", <id>, "euc"]`). */
  earliestCommit?: string;
  /** Hostnames acting as GRASP servers (present in both clone + relays). */
  graspServers: string[];
  createdAt: number;
}

/** Parsed kind 30618 repository state announcement. */
export interface GitRepoState {
  event: NostrEvent;
  identifier: string;
  /** Default branch name when HEAD is symbolic (e.g. `main`). */
  headBranch?: string;
  branches: GitRef[];
  tags: GitRef[];
  createdAt: number;
}

const HEX_PUBKEY_RE = /^[0-9a-f]{64}$/;

/** Collect all values (beyond the name) from every tag with the given name. */
function tagValues(event: NostrEvent, name: string): string[] {
  const values: string[] = [];
  for (const tag of event.tags) {
    if (tag[0] !== name) continue;
    for (const value of tag.slice(1)) {
      if (value) values.push(value);
    }
  }
  return values;
}

function firstTagValue(event: NostrEvent, name: string): string | undefined {
  return event.tags.find(([n]) => n === name)?.[1];
}

function parseHttpsUrl(value: string): URL | undefined {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url : undefined;
  } catch {
    return undefined;
  }
}

function parseRelayUrl(value: string): URL | undefined {
  try {
    const url = new URL(value);
    return url.protocol === 'wss:' || url.protocol === 'ws:' ? url : undefined;
  } catch {
    return undefined;
  }
}

/** True if a clone URL looks like a GRASP-style repo path: `/npub1.../<repo>.git`. */
function isGraspCloneUrl(url: URL): boolean {
  const path = url.pathname.replace(/\/$/, '');
  if (!path.endsWith('.git')) return false;
  const npub = /\/(npub1[a-z0-9]+)\//.exec(url.pathname)?.[1];
  if (!npub) return false;
  try {
    return nip19.decode(npub).type === 'npub';
  } catch {
    return false;
  }
}

/** Minimal validity check for a kind 30617 repository announcement. */
export function isValidRepoAnnouncement(event: NostrEvent): boolean {
  return event.kind === GIT_REPO_KIND && Boolean(firstTagValue(event, 'd'));
}

/** Parse a kind 30617 repository announcement event. */
export function parseRepoAnnouncement(event: NostrEvent): GitRepoAnnouncement {
  if (event.kind !== GIT_REPO_KIND) {
    throw new Error(`Expected kind ${GIT_REPO_KIND}, got ${event.kind}`);
  }

  const identifier = firstTagValue(event, 'd') ?? '';

  const cloneUrls: string[] = [];
  const graspCloneHosts = new Set<string>();
  for (const value of tagValues(event, 'clone')) {
    const url = parseHttpsUrl(value);
    if (!url) continue;
    cloneUrls.push(url.href);
    if (isGraspCloneUrl(url)) graspCloneHosts.add(url.hostname);
  }

  const relays: string[] = [];
  const relayHosts = new Set<string>();
  for (const value of tagValues(event, 'relays')) {
    const url = parseRelayUrl(value);
    if (!url) continue;
    relays.push(url.href);
    relayHosts.add(url.hostname);
  }

  const graspServers = [...graspCloneHosts].filter((host) => relayHosts.has(host));

  const webUrls: string[] = [];
  for (const value of tagValues(event, 'web')) {
    const url = parseHttpsUrl(value);
    if (url) webUrls.push(url.href);
  }

  const maintainers = tagValues(event, 'maintainers').filter(
    (pk) => HEX_PUBKEY_RE.test(pk) && pk !== event.pubkey,
  );

  const hashtags = [...new Set(tagValues(event, 't').map((t) => t.toLowerCase()))];

  const earliestCommit = event.tags.find(
    ([name, , marker]) => name === 'r' && marker === 'euc',
  )?.[1];

  return {
    event,
    pubkey: event.pubkey,
    identifier,
    name: firstTagValue(event, 'name')?.trim() || identifier,
    description: firstTagValue(event, 'description')?.trim() || undefined,
    webUrls: [...new Set(webUrls)],
    cloneUrls: [...new Set(cloneUrls)],
    relays: [...new Set(relays)],
    maintainers: [...new Set(maintainers)],
    hashtags,
    earliestCommit,
    graspServers,
    createdAt: event.created_at,
  };
}

/** Parse a kind 30618 repository state event into branches and tags. */
export function parseRepoState(event: NostrEvent): GitRepoState {
  if (event.kind !== GIT_STATE_KIND) {
    throw new Error(`Expected kind ${GIT_STATE_KIND}, got ${event.kind}`);
  }

  const branches: GitRef[] = [];
  const tags: GitRef[] = [];
  let headBranch: string | undefined;

  for (const [name, value] of event.tags) {
    if (name === 'HEAD' && value?.startsWith('ref: refs/heads/')) {
      headBranch = value.slice('ref: refs/heads/'.length);
    } else if (name.startsWith('refs/heads/') && value) {
      branches.push({ name: name.slice('refs/heads/'.length), commit: value });
    } else if (name.startsWith('refs/tags/') && value) {
      tags.push({ name: name.slice('refs/tags/'.length), commit: value });
    }
  }

  // Default branch first, then alphabetical.
  branches.sort((a, b) => {
    if (a.name === headBranch) return -1;
    if (b.name === headBranch) return 1;
    return a.name.localeCompare(b.name);
  });

  // Tags newest-looking first (natural/numeric descending, so v2 > v1.10 > v1.9).
  tags.sort((a, b) => b.name.localeCompare(a.name, undefined, { numeric: true }));

  return {
    event,
    identifier: firstTagValue(event, 'd') ?? '',
    headBranch,
    branches,
    tags,
    createdAt: event.created_at,
  };
}

/** Build the `nostr://npub.../<identifier>` clone URI understood by ngit. */
export function nostrCloneUri(pubkey: string, identifier: string): string {
  return `nostr://${nip19.npubEncode(pubkey)}/${identifier}`;
}

/** Build the naddr for a repository announcement. */
export function repoNaddr(pubkey: string, identifier: string, relays?: string[]): string {
  return nip19.naddrEncode({
    kind: GIT_REPO_KIND,
    pubkey,
    identifier,
    relays: relays?.slice(0, 3),
  });
}

/** Shorten a commit id for display. */
export function shortCommit(commit: string): string {
  return commit.slice(0, 8);
}
