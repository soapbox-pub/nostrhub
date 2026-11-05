/**
 * What NostrHub notifies a user about, as plain functions over plain data.
 *
 * The in-app bell (`useNotifications`) and the push service worker
 * (`src/sw/worker.ts`) both work from a {@link NotificationContext} — the
 * user's own content, the repos they maintain, the git threads they are part
 * of, and the NIPs they follow — and both use the same two functions on it:
 *
 * - {@link buildNotificationFilters} says which events to ask relays for. The
 *   bell queries them with limits; push hands them to the napp host (Tenna,
 *   Din), which keeps them open while NostrHub is closed.
 * - {@link classifyNotification} decides whether an event that matched is
 *   news to this user, and what it's about.
 *
 * The git half follows GitHub's notification reasons: activity on repos you
 * own or maintain (new issues, pull requests and patches, and the discussion
 * and state changes on them), threads you're participating in (ones you opened
 * or commented on), and mentions.
 *
 * Nothing here may import React or a hook: the service worker bundles it.
 */

import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';
import { nip19 } from 'nostr-tools';

import { APP_HANDLER_KIND, budNumberFromUrl, nipNumberFromUrl } from '@/lib/apps';
import { APP_REVIEW_KIND, REVIEW_LABEL, parseReviewEvent } from '@/lib/appReviews';
import {
  APPROVE_LABEL_NAMESPACE,
  APPROVE_LABEL_VALUE,
  CUSTOM_NIP_KIND,
  isValidCustomNip,
  parseCustomNip,
  parseForkTags,
} from '@/lib/nips';
import {
  GIT_ISSUE_KIND,
  GIT_PATCH_KIND,
  GIT_PR_KIND,
  GIT_PR_UPDATE_KIND,
  GIT_REPO_KIND,
  GIT_STATUS_APPLIED_KIND,
  GIT_STATUS_CLOSED_KIND,
  GIT_STATUS_DRAFT_KIND,
  GIT_STATUS_KINDS,
  GIT_STATUS_OPEN_KIND,
  getRepoUrl,
  parseGitTicket,
} from '@/lib/git';
import { GRAPH_NODE_KIND } from '@/lib/planGraph';
import { ZAPSTORE_RELEASE_KIND, ZAPSTORE_APP_KIND } from '@/lib/zapstore';

/** NIP-23 long-form article. (Also `ARTICLE_KIND` in `useExpertPress`, which is a hook module.) */
const ARTICLE_KIND = 30023;
/** Reaction (NIP-25) kind. */
const REACTION_KIND = 7;
/** Comment (NIP-22) kind. */
const COMMENT_KIND = 1111;
/** Label (NIP-32) kind, used for approvals. */
const LABEL_KIND = 1985;

/** Issues, pull requests and patches: the git "threads". */
export const GIT_TICKET_KINDS = [GIT_ISSUE_KIND, GIT_PR_KIND, GIT_PATCH_KIND] as const;

/**
 * The addressable content kinds a NostrHub user can author and that other users
 * can act on (react, review, comment, approve). Each maps a kind to a
 * human-readable label used in notification copy.
 */
export const OWNED_CONTENT_KINDS = [
  APP_HANDLER_KIND, // 31990 — app listing
  CUSTOM_NIP_KIND, // 30817 — community NIP
  ARTICLE_KIND, // 30023 — long-form article
  GIT_REPO_KIND, // 30617 — git repo announcement
  GRAPH_NODE_KIND, // 32473 — strategy graph node
  ZAPSTORE_APP_KIND, // 32267 — Zapstore app listing
  ZAPSTORE_RELEASE_KIND, // 30063 — Zapstore software release
] as const;

export type OwnedContentKind = (typeof OWNED_CONTENT_KINDS)[number];

/** Short human label for a piece of content, by kind. */
export const CONTENT_KIND_LABEL: Record<number, string> = {
  [APP_HANDLER_KIND]: 'app',
  [CUSTOM_NIP_KIND]: 'NIP',
  [ARTICLE_KIND]: 'article',
  [GIT_REPO_KIND]: 'repo',
  [GRAPH_NODE_KIND]: 'strategy node',
  [ZAPSTORE_APP_KIND]: 'app',
  [ZAPSTORE_RELEASE_KIND]: 'release',
  [GIT_ISSUE_KIND]: 'issue',
  [GIT_PR_KIND]: 'pull request',
  [GIT_PATCH_KIND]: 'patch',
};

/**
 * Kinds whose NIP-22 comment threads live on NostrHub (the `K` of a comment's
 * root). A reply to the user is only news here if it's in one of these; the
 * rest of the network's comment threads are other apps' business.
 */
const NOSTRHUB_COMMENT_ROOT_KINDS = [...OWNED_CONTENT_KINDS, ...GIT_TICKET_KINDS].map(String);

/** A resolved piece of content a notification is about. */
export interface OwnedContent {
  /** Addressable coordinate `kind:pubkey:dTag`, a ticket's event id, or an official NIP's URL. */
  coordinate: string;
  kind: number;
  /** Human-readable title (falls back to the d-tag). */
  title: string;
  /** Route to the content's page. */
  href: string;
  /** Who published it. Absent for official NIPs and BUDs. */
  pubkey?: string;
}

/** A repo the user owns or co-maintains. */
export interface WatchedRepo extends OwnedContent {
  /** The owner and every maintainer; any of them may change an issue's state. */
  maintainers: string[];
}

/** An issue, pull request or patch the user is watching. */
export interface WatchedTicket extends OwnedContent {
  /** Coordinate of the repo it was filed against, if any. */
  repo?: string;
}

/**
 * Everything that decides what's news to one user. Built in the page by
 * `useNotificationContext()` and handed to the service worker through
 * IndexedDB (`src/lib/push/workerState.ts`), so it must stay structured-clonable.
 */
export interface NotificationContext {
  /** Hex pubkey of the logged-in user. */
  pubkey: string;
  /** Addressable content the user authored, by coordinate. */
  owned: Map<string, OwnedContent>;
  /**
   * Repos the user owns or maintains, keyed by every maintainer's coordinate
   * for the repo (NIP-34 has each maintainer announce it under their own key,
   * and issues may name any of them).
   */
  repos: Map<string, WatchedRepo>;
  /** Issues, PRs and patches the user is watching, by event id. */
  tickets: Map<string, WatchedTicket>;
  /**
   * NIPs the user follows, by target (a `30817:` coordinate or a GitHub URL),
   * with the Unix time the follow began and the NIP itself when resolved.
   */
  followed: Map<string, { since: number; content?: OwnedContent }>;
  /** Relays the user reads from: where NIP activity is asked for. */
  readRelays: string[];
  /** Relays that carry NIP-34 traffic: the git discovery relays and the user's repos' own. */
  gitRelays: string[];
}

/** Categories of activity that can generate a notification. */
export type NotificationType =
  | 'reaction'
  | 'review'
  | 'comment'
  | 'approval'
  | 'fork'
  | 'update'
  /** A new issue on a repo the user maintains. */
  | 'issue'
  /** A new pull request or patch on a repo the user maintains. */
  | 'pull'
  /** An issue, PR or patch that names the user. */
  | 'mention'
  /** An issue or PR the user is watching was closed, reopened, merged… */
  | 'status'
  /** New commits on a pull request the user is watching. */
  | 'push';

/**
 * How the user stands to the thing a notification is about — "your issue",
 * "the NIP you follow", or just "the issue" (one they're part of).
 */
export type NotificationRelation = 'own' | 'followed' | 'involved';

/** A classified activity event. */
export interface ClassifiedNotification {
  /** Underlying Nostr event id. */
  id: string;
  event: NostrEvent;
  type: NotificationType;
  /** Pubkey of the actor who generated the activity. */
  actorPubkey: string;
  /** Unix timestamp (seconds) of the activity. */
  createdAt: number;
  /** What the activity is about, when known (see {@link root}). */
  content?: OwnedContent;
  relation: NotificationRelation;
  /** The new item the activity produced: the fork, or the new issue / PR. */
  subject?: { title: string; href: string };
  /** Reaction emoji/symbol (only for `type === 'reaction'`). */
  reaction?: string;
  /** Comment / review / issue text, if any. */
  text?: string;
  /** The status kind (1630–1633), for `type === 'status'`. */
  statusKind?: number;
  /**
   * What the activity is about, when the context doesn't know it: a reply or
   * a state change on a thread the user is part of only by being tagged.
   * Resolve it with {@link contentFromEvent} and fill in `content`.
   */
  root?: { id: string } | { coordinate: string };
}

/** Read the first value of a given tag name. */
export function firstTag(event: NostrEvent, name: string): string | undefined {
  return event.tags.find(([n]) => n === name)?.[1];
}

/**
 * Build an {@link OwnedContent} entry from an addressable event. Returns
 * `null` for events without a `d` tag (not addressable).
 */
export function toOwnedContent(event: NostrEvent): OwnedContent | null {
  const dTag = firstTag(event, 'd');
  if (dTag === undefined) return null;

  const coordinate = `${event.kind}:${event.pubkey}:${dTag}`;
  const title =
    firstTag(event, 'title') ||
    firstTag(event, 'name') ||
    firstTag(event, 'version') || // Zapstore releases (30063) carry a version
    firstTag(event, 'alt') ||
    dTag ||
    CONTENT_KIND_LABEL[event.kind] ||
    'your content';

  // Repos have readable routes of their own; everything else is its naddr.
  const href = event.kind === GIT_REPO_KIND
    ? getRepoUrl(event.pubkey, dTag)
    : `/${nip19.naddrEncode({ kind: event.kind, pubkey: event.pubkey, identifier: dTag })}`;

  return { coordinate, kind: event.kind, title, href, pubkey: event.pubkey };
}

/** The route for an issue, PR or patch. */
export function ticketHref(event: Pick<NostrEvent, 'id' | 'kind' | 'pubkey'>): string {
  return `/${nip19.neventEncode({ id: event.id, kind: event.kind, author: event.pubkey })}`;
}

/** Whether a patch starts a series (or stands alone), rather than continuing one. */
function isRootPatch(event: NostrEvent): boolean {
  if (event.kind !== GIT_PATCH_KIND) return true;
  return event.tags.some(([n, v]) => n === 't' && v === 'root') || !event.tags.some(([n]) => n === 'e');
}

/** Build a {@link WatchedTicket} from an issue, PR or root patch. */
export function toWatchedTicket(event: NostrEvent): WatchedTicket | null {
  const ticket = parseGitTicket(event);
  if (!ticket || !isRootPatch(event)) return null;
  const repo = event.tags.find(([n, v]) => n === 'a' && v?.startsWith(`${GIT_REPO_KIND}:`))?.[1];
  return {
    coordinate: event.id,
    kind: event.kind,
    title: ticket.subject,
    href: ticketHref(event),
    pubkey: event.pubkey,
    repo,
  };
}

/** Notification-ready metadata for an official NIP / BUD URL. */
export function officialNipContent(url: string): OwnedContent | null {
  const bud = budNumberFromUrl(url);
  if (bud) return { coordinate: url, kind: CUSTOM_NIP_KIND, title: `BUD-${bud}`, href: `/bud/${bud}` };
  const nip = nipNumberFromUrl(url);
  if (nip) return { coordinate: url, kind: CUSTOM_NIP_KIND, title: `NIP-${nip}`, href: `/nip/${nip}` };
  return null;
}

/**
 * Content for a notification's {@link ClassifiedNotification.root}, from the
 * root event once it's been fetched.
 */
export function contentFromEvent(event: NostrEvent): OwnedContent | null {
  return toWatchedTicket(event) ?? toOwnedContent(event);
}

/** Every `p` / `P` pubkey on an event. */
function taggedPubkeys(event: NostrEvent, name: 'p' | 'P'): Set<string> {
  return new Set(event.tags.filter(([n]) => n === name).map(([, v]) => v));
}

/** Targets an event may reference: addressable coordinates (`a`/`A`) and URLs (`i`/`I`). */
function referencedCoordinates(event: NostrEvent): string[] {
  const out: string[] = [];
  for (const tag of event.tags) {
    if ((tag[0] === 'a' || tag[0] === 'A' || tag[0] === 'i' || tag[0] === 'I') && tag[1]) out.push(tag[1]);
  }
  return out;
}

/** The thread an event is about: the `root`-marked `e` tag, else the `E` tag, else the first `e`. */
function rootEventId(event: NostrEvent): string | undefined {
  return (
    event.tags.find(([n, , , marker]) => n === 'e' && marker === 'root')?.[1] ??
    event.tags.find(([n]) => n === 'E')?.[1] ??
    event.tags.find(([n]) => n === 'e')?.[1]
  );
}

/** The source a kind-30817 fork points at (its `fork`-marked `a` or `i` tag). */
function forkSource(event: NostrEvent): string | undefined {
  const fork = parseForkTags(event.tags);
  if (!fork) return undefined;
  return fork.type === 'custom' ? fork.address : fork.url;
}

/** Look a coordinate up among the user's own content and repos. */
function ownedAt(ctx: NotificationContext, coordinate: string): OwnedContent | undefined {
  return ctx.owned.get(coordinate) ?? ctx.repos.get(coordinate);
}

function textOf(event: NostrEvent): string | undefined {
  return event.content.trim() || undefined;
}

/** Split a `30817:<pubkey>:<d>` coordinate, or null when it isn't one. */
function splitCoordinate(coordinate: string): { kind: number; pubkey: string; d: string } | null {
  const [kind, pubkey, ...rest] = coordinate.split(':');
  if (!kind || !pubkey || !rest.length) return null;
  return { kind: Number(kind), pubkey, d: rest.join(':') };
}

/**
 * The relay filters that find everything the user should hear about, split by
 * where to ask: NIP activity from their read relays, git activity from git
 * relays. No `limit` or `since` — callers add what their transport needs.
 *
 * `reactions` is off for push: GitHub doesn't send a notification for a star
 * or an emoji, and neither does NostrHub. The bell still lists them.
 */
export function buildNotificationFilters(
  ctx: NotificationContext,
  { reactions = true }: { reactions?: boolean } = {},
): { nip: NostrFilter[]; git: NostrFilter[] } {
  const me = ctx.pubkey;
  const nip: NostrFilter[] = [];
  const git: NostrFilter[] = [];

  // Everything of the user's that can be commented on, reviewed, approved…
  const coordinates = [...new Set([...ctx.owned.keys(), ...ctx.repos.keys()])];
  const ownedNips = coordinates.filter((c) => c.startsWith(`${CUSTOM_NIP_KIND}:`));
  const followedCoords = [...ctx.followed.keys()].filter(
    (t) => t.startsWith(`${CUSTOM_NIP_KIND}:`) && !ctx.owned.has(t),
  );
  const followedUrls = [...ctx.followed.keys()].filter((t) => t.startsWith('https://'));

  if (coordinates.length) {
    if (reactions) nip.push({ kinds: [REACTION_KIND], '#a': coordinates });
    nip.push(
      { kinds: [COMMENT_KIND], '#A': coordinates },
      { kinds: [APP_REVIEW_KIND], '#l': [REVIEW_LABEL], '#a': coordinates },
      { kinds: [LABEL_KIND], '#L': [APPROVE_LABEL_NAMESPACE], '#l': [APPROVE_LABEL_VALUE], '#a': coordinates },
    );
  }
  // Forks of the user's NIPs, or of followed ones.
  if (ownedNips.length || followedCoords.length) {
    nip.push({ kinds: [CUSTOM_NIP_KIND], '#a': [...ownedNips, ...followedCoords] });
  }
  if (followedCoords.length) {
    nip.push({ kinds: [COMMENT_KIND], '#A': followedCoords });
    // New revisions of followed NIPs. One filter for all of them: authors and
    // d-tags cross, so a stray match is possible, and is dropped by
    // `classifyNotification()`, which checks the exact coordinate.
    const parts = followedCoords.map(splitCoordinate).filter((p) => p !== null);
    nip.push({
      kinds: [CUSTOM_NIP_KIND],
      authors: [...new Set(parts.map((p) => p.pubkey))],
      '#d': [...new Set(parts.map((p) => p.d))],
    });
  }
  if (followedUrls.length) {
    nip.push(
      { kinds: [COMMENT_KIND], '#I': followedUrls },
      { kinds: [CUSTOM_NIP_KIND], '#i': followedUrls },
    );
  }
  // Replies to the user's own comments anywhere on NostrHub: a NIP's
  // discussion, an app's, a repo's (lowercase `p` is the parent's author).
  nip.push({ kinds: [COMMENT_KIND], '#p': [me], '#K': [...NOSTRHUB_COMMENT_ROOT_KINDS, 'web'] });

  // --- git (NIP-34) ---

  const repoCoords = [...ctx.repos.keys()];
  const ticketIds = [...ctx.tickets.keys()];
  const ticketKinds = GIT_TICKET_KINDS.map(String);

  // New issues, PRs and patches on the user's repos.
  if (repoCoords.length) git.push({ kinds: [...GIT_TICKET_KINDS], '#a': repoCoords });
  // Anything git that names the user: an issue that @-mentions them, a status
  // or PR update on a thread they opened, an issue on a repo they maintain
  // under another maintainer's coordinate.
  git.push({ kinds: [...GIT_TICKET_KINDS, GIT_PR_UPDATE_KIND, ...GIT_STATUS_KINDS], '#p': [me] });
  // Discussion on threads the user opened, including ones opened since the
  // watched list was last rebuilt (NIP-22 puts the root's author in `P`).
  git.push({ kinds: [COMMENT_KIND], '#P': [me], '#K': ticketKinds });
  // …and replies to the user's comments in anybody's thread.
  git.push({ kinds: [COMMENT_KIND], '#p': [me], '#K': ticketKinds });
  if (ticketIds.length) {
    // Discussion and new commits on every thread the user is watching…
    git.push({ kinds: [COMMENT_KIND, GIT_PR_UPDATE_KIND], '#E': ticketIds });
    // …and state changes on them (status events point at the root with `e`).
    git.push({ kinds: [...GIT_STATUS_KINDS, GIT_PR_UPDATE_KIND], '#e': ticketIds });
  }

  return { nip, git };
}

/**
 * Decide whether an event is news to the user described by `ctx`, and what
 * it's about. Null when it isn't: the user's own activity, an event no rule
 * claims, or one that fails validation.
 *
 * Doesn't verify signatures: the page's pool already has, and the worker does
 * before calling this.
 */
export function classifyNotification(event: NostrEvent, ctx: NotificationContext): ClassifiedNotification | null {
  const me = ctx.pubkey;
  // Never notify the user about their own activity.
  if (event.pubkey === me) return null;

  const base = { id: event.id, event, actorPubkey: event.pubkey, createdAt: event.created_at };

  /** Followed-NIP activity only counts from when the follow began. */
  const beforeFollow = (target: string) => {
    const since = ctx.followed.get(target)?.since;
    return since !== undefined && event.created_at < since;
  };
  const followedContent = (target: string) => ctx.followed.get(target)?.content ?? officialNipContent(target) ?? undefined;

  // --- Community NIPs: forks and new revisions ---
  if (event.kind === CUSTOM_NIP_KIND) {
    if (!isValidCustomNip(event)) return null;
    const nip = parseCustomNip(event);
    if (ctx.followed.has(nip.address)) {
      if (beforeFollow(nip.address)) return null;
      return {
        ...base,
        type: 'update',
        content: followedContent(nip.address),
        relation: 'followed',
      };
    }
    const source = forkSource(event);
    if (!source) return null;
    const owned = ownedAt(ctx, source);
    if (!owned && !ctx.followed.has(source)) return null;
    if (!owned && beforeFollow(source)) return null;
    return {
      ...base,
      type: 'fork',
      content: owned ?? followedContent(source),
      relation: owned ? 'own' : 'followed',
      subject: { title: nip.title, href: `/${nip.naddr}` },
    };
  }

  // --- Git: new issues, PRs and patches ---
  if ((GIT_TICKET_KINDS as readonly number[]).includes(event.kind)) {
    const ticket = toWatchedTicket(event);
    if (!ticket) return null; // A later patch in a series: the root already said it.
    const text = event.kind === GIT_PATCH_KIND ? undefined : textOf(event);
    const repo = event.tags
      .filter(([n]) => n === 'a')
      .map(([, v]) => ctx.repos.get(v))
      .find((r) => r !== undefined);
    if (repo) {
      return {
        ...base,
        type: event.kind === GIT_ISSUE_KIND ? 'issue' : 'pull',
        content: repo,
        relation: 'own',
        subject: { title: ticket.title, href: ticket.href },
        text,
      };
    }
    if (!taggedPubkeys(event, 'p').has(me)) return null;
    return { ...base, type: 'mention', content: ticket, relation: 'involved', text };
  }

  // --- Git: state changes and new commits on watched threads ---
  if ((GIT_STATUS_KINDS as readonly number[]).includes(event.kind) || event.kind === GIT_PR_UPDATE_KIND) {
    const rootId = rootEventId(event);
    if (!rootId) return null;
    const ticket = ctx.tickets.get(rootId);
    if (!ticket && !taggedPubkeys(event, 'p').has(me)) return null;
    // Only the thread's author or the repo's maintainers can change its state
    // or push to it. Checked where the context knows who they are.
    if (ticket) {
      const repo = ticket.repo ? ctx.repos.get(ticket.repo) : undefined;
      if (repo && event.pubkey !== ticket.pubkey && !repo.maintainers.includes(event.pubkey)) return null;
    }
    const relation: NotificationRelation = ticket?.pubkey === me ? 'own' : 'involved';
    if (event.kind === GIT_PR_UPDATE_KIND) {
      return { ...base, type: 'push', content: ticket, relation, root: ticket ? undefined : { id: rootId } };
    }
    return {
      ...base,
      type: 'status',
      content: ticket,
      relation,
      statusKind: event.kind,
      text: textOf(event),
      root: ticket ? undefined : { id: rootId },
    };
  }

  const refs = referencedCoordinates(event);
  const ownedCoord = refs.find((c) => ownedAt(ctx, c));
  const owned = ownedCoord ? ownedAt(ctx, ownedCoord) : undefined;

  if (event.kind === COMMENT_KIND) {
    const text = textOf(event);
    // On the user's own content (the root, `A`).
    const rootAddress = firstTag(event, 'A');
    const ownedRoot = rootAddress ? ownedAt(ctx, rootAddress) : undefined;
    if (ownedRoot) return { ...base, type: 'comment', content: ownedRoot, relation: 'own', text };

    // In a git thread the user is watching.
    const rootId = firstTag(event, 'E');
    const ticket = rootId ? ctx.tickets.get(rootId) : undefined;
    if (ticket) {
      return { ...base, type: 'comment', content: ticket, relation: ticket.pubkey === me ? 'own' : 'involved', text };
    }

    // On a NIP the user follows.
    const rootTarget = rootAddress ?? firstTag(event, 'I');
    if (rootTarget && ctx.followed.has(rootTarget)) {
      if (beforeFollow(rootTarget)) return null;
      return { ...base, type: 'comment', content: followedContent(rootTarget), relation: 'followed', text };
    }

    // A reply to the user, or a comment on a thread they started, somewhere
    // the context doesn't know about yet.
    const toMe = taggedPubkeys(event, 'p').has(me) || taggedPubkeys(event, 'P').has(me);
    if (!toMe) return null;
    const rootKind = firstTag(event, 'K');
    if (!rootKind || (!NOSTRHUB_COMMENT_ROOT_KINDS.includes(rootKind) && rootKind !== 'web')) return null;
    if (rootKind === 'web') {
      // Only the discussion of an official NIP or BUD is NostrHub's.
      const content = rootTarget ? officialNipContent(rootTarget) : null;
      if (!content) return null;
      return { ...base, type: 'comment', content, relation: 'involved', text };
    }
    const relation: NotificationRelation = taggedPubkeys(event, 'P').has(me) ? 'own' : 'involved';
    if (rootId) return { ...base, type: 'comment', relation, text, root: { id: rootId } };
    if (rootAddress) return { ...base, type: 'comment', relation, text, root: { coordinate: rootAddress } };
    return null;
  }

  if (!owned) return null;

  if (event.kind === REACTION_KIND) {
    return { ...base, type: 'reaction', content: owned, relation: 'own', reaction: event.content.trim() || '+' };
  }
  if (event.kind === APP_REVIEW_KIND) {
    // Only count valid NIP-compatibility reports on the user's apps.
    if (!parseReviewEvent(event)) return null;
    return { ...base, type: 'review', content: owned, relation: 'own', text: textOf(event) };
  }
  if (event.kind === LABEL_KIND) {
    return { ...base, type: 'approval', content: owned, relation: 'own' };
  }
  return null;
}

/** The verb for a status event, given what kind of thread it's on. */
export function statusVerb(statusKind: number, ticketKind?: number): string {
  switch (statusKind) {
    case GIT_STATUS_OPEN_KIND:
      return 'reopened';
    case GIT_STATUS_CLOSED_KIND:
      return 'closed';
    case GIT_STATUS_DRAFT_KIND:
      return 'marked as draft';
    case GIT_STATUS_APPLIED_KIND:
      if (ticketKind === GIT_ISSUE_KIND) return 'resolved';
      if (ticketKind === GIT_PATCH_KIND) return 'applied';
      if (ticketKind === GIT_PR_KIND) return 'merged';
      return 'resolved';
    default:
      return 'updated';
  }
}

/**
 * What the actor did, as the words between their name and the thing it was
 * done to: "commented on", "opened an issue on", "merged".
 */
export function notificationAction(n: Pick<ClassifiedNotification, 'type' | 'statusKind' | 'event' | 'content'>): string {
  switch (n.type) {
    case 'reaction':
      return 'reacted to';
    case 'comment':
      return 'commented on';
    case 'review':
      return 'reviewed';
    case 'approval':
      return 'approved';
    case 'fork':
      return 'forked';
    case 'update':
      return 'published a new revision of';
    case 'issue':
      return 'opened an issue on';
    case 'pull':
      return n.event.kind === GIT_PATCH_KIND ? 'sent a patch to' : 'opened a pull request on';
    case 'mention':
      return 'mentioned you in';
    case 'status':
      return statusVerb(n.statusKind ?? 0, n.content?.kind);
    case 'push':
      return 'pushed new commits to';
  }
}

/** "your", "the", or nothing, before the label of what a notification is about. */
export function notificationPossessive(n: Pick<ClassifiedNotification, 'relation' | 'content'>): string | null {
  // Official NIP / BUD titles ("NIP-01") already name the thing.
  if (n.content && /^(NIP|BUD)-/.test(n.content.title) && !n.content.pubkey) return null;
  return n.relation === 'own' ? 'your' : 'the';
}

/**
 * One line of plain text for a notification: the title of a push, or an
 * accessible label. `actor` is the display name to use.
 */
export function describeNotification(n: ClassifiedNotification, actor: string): { title: string; body: string } {
  const action = notificationAction(n);
  const possessive = notificationPossessive(n);
  const label = n.content ? CONTENT_KIND_LABEL[n.content.kind] ?? 'post' : null;
  const target = n.content
    ? [possessive, possessive ? label : null, n.content.title].filter(Boolean).join(' ')
    : 'a thread you’re in';
  const followed = n.relation === 'followed' ? ' you follow' : '';

  let title = `${actor} ${action} ${target}${followed}`;
  if (n.type === 'issue' || n.type === 'pull') title = `${actor} ${action} ${n.content?.title ?? 'your repo'}`;

  let body = n.text ?? '';
  if (n.subject) body = n.text ? `${n.subject.title}\n${n.text}` : n.subject.title;
  if (n.type === 'reaction') body = n.reaction === '+' ? '\u{1F44D}' : n.reaction ?? '';
  return { title, body: body.slice(0, 500) };
}

/** Where tapping a notification goes. */
export function notificationHref(n: Pick<ClassifiedNotification, 'type' | 'event' | 'content' | 'subject'>): string {
  if (n.type === 'issue' || n.type === 'pull' || n.type === 'fork') return n.subject?.href ?? n.content?.href ?? '/notifications';
  if (n.type === 'comment' && n.content) {
    // Repo discussions live on the repository page's Discussion tab.
    if (n.content.kind === GIT_REPO_KIND) return `${n.content.href}?tab=discussion#comment-${n.event.id}`;
    return `${n.content.href}#comment-${n.event.id}`;
  }
  return n.content?.href ?? '/notifications';
}
