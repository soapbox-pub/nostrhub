import { useQuery } from '@tanstack/react-query';
import { nip19 } from 'nostr-tools';
import { useNostr } from '@nostrify/react';
import { CUSTOM_NIP_KIND, isValidCustomNip, parseCustomNip, type NipFork } from '@/lib/nips';
import { isBudUrl, budNumberFromUrl } from '@/lib/apps';
import { DITTO_RELAY } from '@/lib/appRelays';
import { useAppContext } from '@/hooks/useAppContext';

const NIPS_RAW_BASE = 'https://raw.githubusercontent.com/nostr-protocol/nips/refs/heads/master';
const GITHUB_BLOB_BASE = 'https://github.com/nostr-protocol/nips/blob/master';
const BLOSSOM_RAW_BASE = 'https://raw.githubusercontent.com/hzrd149/blossom/refs/heads/master';
const NIPS_RAW_REPO = 'https://raw.githubusercontent.com/nostr-protocol/nips';
const BLOSSOM_RAW_REPO = 'https://raw.githubusercontent.com/hzrd149/blossom';

/** A resolved NIP document, regardless of whether it's official or custom. */
export interface ResolvedNip {
  title: string;
  content: string;
  /** Internal route to the NIP's detail page, if it has one. */
  href?: string;
  /** Canonical, stable form of this NIP's reference. */
  canonicalRef: NipRef;
}

/**
 * A reference to a NIP that can be resolved to its text. Three shapes are
 * accepted so the same diff plumbing works for forks (whose parent may be
 * official or custom) and for ad-hoc "compare any two" selections:
 *
 *  - `official:<CODE>`              e.g. `official:01`
 *  - `<naddr1...>`                  a custom NIP naddr (resolves the latest version)
 *  - `<nevent1...>`                 one specific revision of a custom NIP
 *  - `<30817:pubkey:d>`             a raw addressable coordinate
 *
 * A raw GitHub blob/raw URL for an official NIP (the form stored in fork `i`
 * tags) is also recognized.
 */
export type NipRef = string;

function officialCodeFromRef(ref: string): string | undefined {
  if (ref.startsWith('official:')) return ref.slice('official:'.length).toUpperCase();
  if (isBudUrl(ref)) return undefined; // BUD URLs are handled separately.
  // Fork `i` tags store the raw GitHub URL: .../master/<CODE>.md
  const m = ref.match(/\/(?:blob\/master|refs\/heads\/master)\/([A-Za-z0-9]+)\.md$/);
  if (m) return m[1].toUpperCase();
  return undefined;
}

function budCodeFromRef(ref: string): string | undefined {
  if (ref.startsWith('bud:')) return ref.slice('bud:'.length);
  if (isBudUrl(ref)) return budNumberFromUrl(ref) ?? undefined;
  return undefined;
}

function extractTitle(content: string, fallback: string): string {
  const line = content.split('\n').find((l) => l.startsWith('# '));
  return line ? line.replace(/^#\s+/, '').trim() : fallback;
}

/** Decode a custom-NIP ref (naddr or `30817:pubkey:d` coordinate) to its parts. */
function customCoord(ref: string): { pubkey: string; identifier: string } | undefined {
  const parts = ref.split(':');
  if (parts.length === 3 && parts[0] === String(CUSTOM_NIP_KIND)) {
    return { pubkey: parts[1], identifier: parts[2] };
  }
  try {
    const decoded = nip19.decode(ref);
    if (decoded.type === 'naddr' && decoded.data.kind === CUSTOM_NIP_KIND) {
      return { pubkey: decoded.data.pubkey, identifier: decoded.data.identifier };
    }
  } catch {
    // not a nip19 string
  }
  return undefined;
}

/**
 * Reduce any accepted {@link NipRef} shape to a single canonical form so two
 * references to the same NIP compare equal:
 *  - official NIPs → `official:<CODE>`
 *  - custom NIPs   → `30817:<pubkey>:<d>` address coordinate
 *
 * Unrecognized refs are returned unchanged.
 */
export function canonicalizeRef(ref: NipRef): NipRef {
  const pinned = pinnedSpec(ref);
  if (pinned) return `${pinned.type}:${pinned.code}@${pinned.commit}`;
  const budCode = budCodeFromRef(ref);
  if (budCode) return `bud:${budCode}`;
  const code = officialCodeFromRef(ref);
  if (code) return `official:${code}`;
  const coord = customCoord(ref);
  if (coord) return `${CUSTOM_NIP_KIND}:${coord.pubkey}:${coord.identifier}`;
  return ref;
}

/** `official:<CODE>@<sha>` / `bud:<NN>@<sha>`: a spec file at a specific GitHub commit. */
const PINNED_SPEC_RE = /^(official|bud):([A-Za-z0-9]+)@([0-9a-fA-F]{40})$/;

function pinnedSpec(ref: string): { type: 'official' | 'bud'; code: string; commit: string } | undefined {
  const m = ref.match(PINNED_SPEC_RE);
  if (!m) return undefined;
  const type = m[1] as 'official' | 'bud';
  return { type, code: type === 'official' ? m[2].toUpperCase() : m[2], commit: m[3].toLowerCase() };
}

/** Decode a version-pinned custom-NIP ref (`nevent`) to its event id. */
function pinnedEventId(ref: string): string | undefined {
  if (!ref.startsWith('nevent1')) return undefined;
  try {
    const decoded = nip19.decode(ref);
    if (decoded.type !== 'nevent') return undefined;
    if (decoded.data.kind !== undefined && decoded.data.kind !== CUSTOM_NIP_KIND) return undefined;
    return decoded.data.id;
  } catch {
    return undefined;
  }
}

/** Build a version-pinned {@link NipRef} for one specific revision of a custom NIP. */
export function revisionRef(event: { id: string; pubkey: string }): NipRef {
  return nip19.neventEncode({ id: event.id, author: event.pubkey, kind: CUSTOM_NIP_KIND });
}

/** Resolve any {@link NipRef} to its title + markdown content. */
export function useResolvedNip(ref: NipRef | undefined) {
  const { nostr } = useNostr();
  const { config } = useAppContext();
  const revisionsRelay = config.statsRelay || DITTO_RELAY;

  return useQuery<ResolvedNip | null>({
    queryKey: ['resolved-nip', ref ?? '', revisionsRelay],
    queryFn: async ({ signal }) => {
      if (!ref) return null;

      // An official NIP or BUD at the commit a fork was taken from.
      const spec = pinnedSpec(ref);
      if (spec) {
        const url =
          spec.type === 'official'
            ? `${NIPS_RAW_REPO}/${spec.commit}/${spec.code}.md`
            : `${BLOSSOM_RAW_REPO}/${spec.commit}/buds/${spec.code}.md`;
        const response = await fetch(url, { signal });
        if (!response.ok) throw new Error(`Failed to fetch ${ref}`);
        const content = await response.text();
        const label = spec.type === 'official' ? `NIP-${spec.code}` : `BUD-${spec.code}`;
        return {
          title: `${extractTitle(content, label)} (@${spec.commit.slice(0, 7)})`,
          content,
          href: spec.type === 'official' ? `/nip/${spec.code}` : `/bud/${spec.code}`,
          canonicalRef: `${spec.type}:${spec.code}@${spec.commit}`,
        };
      }

      // A specific revision: try the pool, then the relay that keeps history.
      const eventId = pinnedEventId(ref);
      if (eventId) {
        const opts = { signal: AbortSignal.any([signal, AbortSignal.timeout(6000)]) };
        const filter = { ids: [eventId], limit: 1 };
        const fromPool = await nostr.query([filter], opts);
        const events =
          fromPool.length > 0 ? fromPool : await nostr.relay(revisionsRelay).query([filter], opts);
        const event = events.find(isValidCustomNip);
        if (!event) return null;
        const nip = parseCustomNip(event);
        const date = new Date(nip.createdAt * 1000).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        });
        return {
          title: `${nip.title} (${date})`,
          content: nip.content,
          href: `/${ref}`,
          canonicalRef: ref,
        };
      }

      const budCode = budCodeFromRef(ref);
      if (budCode) {
        const response = await fetch(`${BLOSSOM_RAW_BASE}/buds/${budCode}.md`, { signal });
        if (!response.ok) throw new Error(`Failed to fetch BUD-${budCode}`);
        const content = await response.text();
        return {
          title: extractTitle(content, `BUD-${budCode}`),
          content,
          href: `/bud/${budCode}`,
          canonicalRef: `bud:${budCode}`,
        };
      }

      const code = officialCodeFromRef(ref);
      if (code) {
        const response = await fetch(`${NIPS_RAW_BASE}/${code}.md`, { signal });
        if (!response.ok) throw new Error(`Failed to fetch NIP-${code}`);
        const content = await response.text();
        return {
          title: extractTitle(content, `NIP-${code}`),
          content,
          href: `/nip/${code}`,
          canonicalRef: `official:${code}`,
        };
      }

      const coord = customCoord(ref);
      if (coord) {
        const events = await nostr.query(
          [{ kinds: [CUSTOM_NIP_KIND], authors: [coord.pubkey], '#d': [coord.identifier], limit: 1 }],
          { signal: AbortSignal.any([signal, AbortSignal.timeout(6000)]) },
        );
        const event = events.find(isValidCustomNip);
        if (!event) return null;
        const nip = parseCustomNip(event);
        return {
          title: nip.title,
          content: nip.content,
          href: `/${nip.naddr}`,
          canonicalRef: `${CUSTOM_NIP_KIND}:${nip.author}:${nip.identifier}`,
        };
      }

      throw new Error('Unrecognized NIP reference');
    },
    enabled: !!ref,
    staleTime: 60 * 1000,
  });
}

/**
 * Refs for diffing a fork against its source: `latest` is the source as it is
 * now; `pinned` (when the fork recorded it) is the exact version it was forked
 * from.
 */
export function forkSourceRefs(fork: NipFork): { latest: NipRef; pinned?: NipRef } {
  if (fork.type === 'custom') {
    const pubkey = fork.address.split(':')[1];
    return {
      latest: fork.address,
      pinned: fork.eventId && pubkey ? revisionRef({ id: fork.eventId, pubkey }) : undefined,
    };
  }
  if (!fork.commit) return { latest: fork.url };
  const bud = budCodeFromRef(fork.url);
  const code = bud ?? officialCodeFromRef(fork.url);
  return {
    latest: fork.url,
    pinned: code ? `${bud ? 'bud' : 'official'}:${code}@${fork.commit}` : undefined,
  };
}

/** Build the GitHub raw-blob URL stored in fork `i` tags, from a NIP code. */
export function officialForkUrl(code: string): string {
  return `${GITHUB_BLOB_BASE}/${code.toUpperCase()}.md`;
}
