import { useQuery } from '@tanstack/react-query';
import { nip19 } from 'nostr-tools';
import { useNostr } from '@nostrify/react';
import { CUSTOM_NIP_KIND, isValidCustomNip, parseCustomNip } from '@/lib/nips';

const NIPS_RAW_BASE = 'https://raw.githubusercontent.com/nostr-protocol/nips/refs/heads/master';
const GITHUB_BLOB_BASE = 'https://github.com/nostr-protocol/nips/blob/master';

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
 *  - `<naddr1...>` / `<note/nevent>` a custom NIP naddr (or its address)
 *  - `<30817:pubkey:d>`             a raw addressable coordinate
 *
 * A raw GitHub blob/raw URL for an official NIP (the form stored in fork `i`
 * tags) is also recognized.
 */
export type NipRef = string;

function officialCodeFromRef(ref: string): string | undefined {
  if (ref.startsWith('official:')) return ref.slice('official:'.length).toUpperCase();
  // Fork `i` tags store the raw GitHub URL: .../master/<CODE>.md
  const m = ref.match(/\/(?:blob\/master|refs\/heads\/master)\/([A-Za-z0-9]+)\.md$/);
  if (m) return m[1].toUpperCase();
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
  const code = officialCodeFromRef(ref);
  if (code) return `official:${code}`;
  const coord = customCoord(ref);
  if (coord) return `${CUSTOM_NIP_KIND}:${coord.pubkey}:${coord.identifier}`;
  return ref;
}

/** Resolve any {@link NipRef} to its title + markdown content. */
export function useResolvedNip(ref: NipRef | undefined) {
  const { nostr } = useNostr();

  return useQuery<ResolvedNip | null>({
    queryKey: ['resolved-nip', ref ?? ''],
    queryFn: async ({ signal }) => {
      if (!ref) return null;

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

/** Build the GitHub raw-blob URL stored in fork `i` tags, from a NIP code. */
export function officialForkUrl(code: string): string {
  return `${GITHUB_BLOB_BASE}/${code.toUpperCase()}.md`;
}
