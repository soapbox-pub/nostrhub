import { nip19 } from 'nostr-tools';
import type { NostrEvent } from '@nostrify/nostrify';
import { CHAT_ORIGIN } from '@/lib/chat';
import {
  GIT_PATCH_KIND,
  GIT_PR_UPDATE_KIND,
  GIT_REPO_KIND,
  GIT_STATUS_KINDS,
  getRepoUrl,
} from '@/lib/git';

const HEX_ID_RE = /^[0-9a-f]{64}$/;
const HEX_PUBKEY_RE = /^[0-9a-f]{64}$/;

function firstTagValue(event: NostrEvent, name: string): string | undefined {
  return event.tags.find(([n]) => n === name)?.[1];
}

/** Relay hint (`["e", <id>, <relay>]` position 2) if it parses as ws/wss. */
function tagRelayHint(tag: string[] | undefined): string[] {
  const hint = tag?.[2];
  if (!hint) return [];
  try {
    const url = new URL(hint);
    return url.protocol === 'wss:' || url.protocol === 'ws:' ? [url.href] : [];
  } catch {
    return [];
  }
}

/** Encode an internal `/{nevent}` path, or undefined if the id is malformed. */
function neventPath(id: string, relays: string[]): string | undefined {
  if (!HEX_ID_RE.test(id)) return undefined;
  try {
    return `/${nip19.neventEncode({ id, relays: relays.slice(0, 3) })}`;
  } catch {
    return undefined;
  }
}

/**
 * Compute the canonical in-app path for an already-fetched event, GitHub-style:
 * events that are *about* something (statuses, PR updates, comments, chat
 * messages, non-root patches) resolve to the page of the thing they're about,
 * with `#comment-<id>` anchors for comments. Returns `undefined` when the
 * event should be rendered in place instead of redirecting.
 */
export function resolveEventPath(event: NostrEvent, relayHints: string[] = []): string | undefined {
  /** Path for an `e`/`E` reference tag, unless it's missing or self-referential. */
  const refPath = (tag: string[] | undefined): string | undefined => {
    const id = tag?.[1];
    if (!id || id === event.id) return undefined;
    return neventPath(id, [...tagRelayHint(tag), ...relayHints]);
  };

  // Status events (1630-1633) open the issue / PR / root patch they refer to.
  if ((GIT_STATUS_KINDS as readonly number[]).includes(event.kind)) {
    const rootTag =
      event.tags.find(([n, , , marker]) => n === 'e' && marker === 'root') ??
      event.tags.find(([n]) => n === 'e');
    return refPath(rootTag);
  }

  // PR updates (1619) open the pull request whose tip they move.
  if (event.kind === GIT_PR_UPDATE_KIND) {
    const prTag = event.tags.find(([n]) => n === 'E') ?? event.tags.find(([n]) => n === 'e');
    return refPath(prTag);
  }

  // Non-root patches walk up the series (`e` reply → previous patch / root);
  // each hop re-enters this resolver until it lands on the root patch page.
  if (event.kind === GIT_PATCH_KIND) {
    const isRoot = event.tags.some(([n, v]) => n === 't' && v === 'root');
    if (isRoot) return undefined;
    return refPath(event.tags.find(([n]) => n === 'e'));
  }

  // NIP-22 comments open their root's page, anchored at the comment.
  if (event.kind === 1111) {
    const anchor = `#comment-${event.id}`;

    const rootTag = event.tags.find(([n]) => n === 'E');
    if (rootTag?.[1]) {
      const path = refPath(rootTag);
      return path ? `${path}${anchor}` : undefined;
    }

    const address = firstTagValue(event, 'A');
    if (address) {
      const [kindStr, pubkey, ...rest] = address.split(':');
      const kind = Number(kindStr);
      const identifier = rest.join(':');
      if (!Number.isInteger(kind) || !HEX_PUBKEY_RE.test(pubkey ?? '')) return undefined;
      // Repo discussions live on the repository page's Discussion tab.
      if (kind === GIT_REPO_KIND) {
        return `${getRepoUrl(pubkey, identifier)}?tab=discussion${anchor}`;
      }
      try {
        return `/${nip19.naddrEncode({ kind, pubkey, identifier })}${anchor}`;
      } catch {
        return undefined;
      }
    }

    return undefined;
  }

  // NIP-C7 chat messages open their channel.
  if (event.kind === 9) {
    const url = firstTagValue(event, 'i');
    if (url?.startsWith(`${CHAT_ORIGIN}/chat/`)) {
      const topic = url.slice(`${CHAT_ORIGIN}/chat/`.length);
      if (topic && !topic.includes('/')) return `/chat/${topic}`;
    }
    return undefined;
  }

  return undefined;
}
