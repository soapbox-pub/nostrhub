import { nip19 } from 'nostr-tools';
import type { NostrEvent } from '@nostrify/nostrify';
import { sanitizeUrl } from '@/lib/sanitizeUrl';

/**
 * Zapstore software releases. The Zapstore ecosystem reuses NIP-82 / NIP-51
 * style addressable events to publish software:
 *
 * - kind 30063 — a software *release*: release notes (`content`), a `version`,
 *   a release `channel` (`c`), the app it belongs to (`i`), and `e` tags
 *   pointing at the individual downloadable assets.
 * - kind 32267 — the app's metadata listing (name, icon, summary, platforms).
 * - kind 3063   — a single downloadable *asset* (a binary for one platform).
 */
export const ZAPSTORE_RELEASE_KIND = 30063;
export const ZAPSTORE_APP_KIND = 32267;
export const ZAPSTORE_ASSET_KIND = 3063;

/** Parsed kind 30063 Zapstore release. */
export interface ZapstoreRelease {
  event: NostrEvent;
  pubkey: string;
  /** The `d` tag — the release coordinate, e.g. `app-id@1.2.3`. */
  identifier: string;
  /** Identifier of the app this release belongs to (`i` tag). */
  appIdentifier?: string;
  /** Human-readable version, e.g. `1.2.3` (`version` tag). */
  version?: string;
  /** Release channel — `main`, `beta`, `nightly`, … (`c` tag, defaults to `main`). */
  channel: string;
  /** Markdown release notes (the event `content`). */
  notes: string;
  /** Event ids of the downloadable assets (`e` tags). */
  assetIds: string[];
  /** Plain address coordinate: "30063:<pubkey>:<d>". */
  address: string;
  /** bech32 naddr for routing to the release. */
  naddr: string;
  createdAt: number;
}

function firstTag(event: NostrEvent, name: string): string | undefined {
  return event.tags.find(([n]) => n === name)?.[1];
}

/** Minimal validity check for a kind 30063 Zapstore release. */
export function isValidRelease(event: NostrEvent): boolean {
  if (event.kind !== ZAPSTORE_RELEASE_KIND) return false;
  // A release must carry a `d` identifier and reference an app (`i`) or a
  // version — bare addressable events without either aren't useful releases.
  const hasIdentifier = Boolean(firstTag(event, 'd'));
  const hasAppOrVersion = Boolean(firstTag(event, 'i') || firstTag(event, 'version'));
  return hasIdentifier && hasAppOrVersion;
}

/** Parse a kind 30063 Zapstore release event into structured data. */
export function parseRelease(event: NostrEvent): ZapstoreRelease {
  if (event.kind !== ZAPSTORE_RELEASE_KIND) {
    throw new Error(`Expected kind ${ZAPSTORE_RELEASE_KIND}, got ${event.kind}`);
  }

  const identifier = firstTag(event, 'd') ?? '';
  const appIdentifier = firstTag(event, 'i');

  const assetIds = event.tags
    .filter(([name, value]) => name === 'e' && value)
    .map(([, value]) => value);

  return {
    event,
    pubkey: event.pubkey,
    identifier,
    appIdentifier,
    version: firstTag(event, 'version'),
    channel: firstTag(event, 'c') || 'main',
    notes: event.content,
    assetIds,
    address: `${ZAPSTORE_RELEASE_KIND}:${event.pubkey}:${identifier}`,
    naddr: nip19.naddrEncode({
      kind: ZAPSTORE_RELEASE_KIND,
      pubkey: event.pubkey,
      identifier,
    }),
    createdAt: event.created_at,
  };
}

/** Parsed kind 32267 Zapstore app listing (the bits a release card needs). */
export interface ZapstoreApp {
  pubkey: string;
  identifier: string;
  name: string;
  /** Sanitized https icon URL. */
  icon?: string;
  summary?: string;
}

/** Parse a kind 32267 Zapstore app event into the minimal listing used here. */
export function parseZapstoreApp(event: NostrEvent): ZapstoreApp | null {
  if (event.kind !== ZAPSTORE_APP_KIND) return null;
  const identifier = firstTag(event, 'd');
  if (!identifier) return null;

  return {
    pubkey: event.pubkey,
    identifier,
    name: firstTag(event, 'name') || identifier,
    icon: sanitizeUrl(firstTag(event, 'icon')),
    summary: firstTag(event, 'summary'),
  };
}

/** Derive a display label for a release when no linked app name is known. */
export function releaseDisplayName(release: ZapstoreRelease): string {
  if (release.appIdentifier) return release.appIdentifier;
  // `d` tags are often `app-id@version` — strip the version suffix.
  return release.identifier.split('@')[0] || release.identifier;
}
