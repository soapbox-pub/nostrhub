/**
 * Minimal git smart-HTTP (protocol v0) client that fetches *commit objects
 * only* from a repository, using the `filter tree:0` partial-clone capability.
 *
 * A commits-only pack is tiny (a few hundred bytes per commit) regardless of
 * repository size, which makes ahead/behind computation affordable in the
 * browser — a full isomorphic-git shallow fetch of a large repo downloads
 * every tree and blob and can run to hundreds of megabytes.
 *
 * Only what's needed is implemented: pkt-line framing, the v0 ref
 * advertisement, a `want`/`deepen`/`filter` upload-pack request, side-band
 * demuxing, and a packfile parser that inflates commits (with ref/ofs-delta
 * resolution) and extracts their parent ids.
 */

import pako from 'pako';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const OID_RE = /^[0-9a-f]{40}$/;

// ————————————————————————————— pkt-line —————————————————————————————

/** Encode one pkt-line. */
function pktLine(line: string): string {
  const payload = encoder.encode(line);
  return (payload.length + 4).toString(16).padStart(4, '0') + line;
}

/** Iterate pkt-lines; `null` marks a flush-pkt (0000) or delim-pkt (0001). */
function* pktLines(data: Uint8Array): Generator<Uint8Array | null> {
  let i = 0;
  while (i + 4 <= data.length) {
    const len = parseInt(decoder.decode(data.subarray(i, i + 4)), 16);
    if (Number.isNaN(len)) throw new Error('Malformed pkt-line stream');
    if (len < 4) {
      yield null;
      i += 4;
      continue;
    }
    yield data.subarray(i + 4, i + len);
    i += len;
  }
}

// ——————————————————————— ref advertisement ———————————————————————

export interface RefAdvertisement {
  /** Ref name → commit id, including `HEAD`. */
  refs: Map<string, string>;
  /** Server capabilities from the first ref line. */
  caps: Set<string>;
  /** What `HEAD` points at (from the `symref=HEAD:…` capability), if known. */
  headSymref?: string;
}

/** `GET <repo>/info/refs?service=git-upload-pack` — the v0 ref listing. */
export async function fetchRefAdvertisement(
  repoUrl: string,
  signal?: AbortSignal,
): Promise<RefAdvertisement> {
  const base = repoUrl.replace(/\/+$/, '');
  const res = await fetch(`${base}/info/refs?service=git-upload-pack`, { signal });
  if (!res.ok) throw new Error(`info/refs: HTTP ${res.status}`);
  const body = new Uint8Array(await res.arrayBuffer());

  const refs = new Map<string, string>();
  const caps = new Set<string>();
  let headSymref: string | undefined;
  let sawService = false;

  for (const line of pktLines(body)) {
    if (line === null) continue;
    let text = decoder.decode(line).replace(/\n$/, '');
    if (text.startsWith('#')) {
      sawService = true;
      continue;
    }
    // The first ref line carries `\0`-separated capabilities.
    const nul = text.indexOf('\0');
    if (nul !== -1) {
      for (const cap of text.slice(nul + 1).split(' ')) {
        if (!cap) continue;
        caps.add(cap);
        if (cap.startsWith('symref=HEAD:')) headSymref = cap.slice('symref=HEAD:'.length);
      }
      text = text.slice(0, nul);
    }
    const [oid, name] = text.split(' ');
    if (oid && name && OID_RE.test(oid)) refs.set(name, oid);
  }

  if (!sawService && refs.size === 0) throw new Error('Not a smart-HTTP git server');
  return { refs, caps, headSymref };
}

// ————————————————————————— commit fetch —————————————————————————

export interface CommitGraphOptions {
  repoUrl: string;
  /** Commit ids to fetch history for (must be advertised by the server). */
  wants: string[];
  /** Shallow depth from each want. */
  depth: number;
  signal?: AbortSignal;
}

/**
 * Fetch the commit graph reachable from `wants` (to `depth`) as a map of
 * commit id → parent ids, using `filter tree:0` so no trees or blobs are
 * transferred.
 */
export async function fetchCommitGraph(options: CommitGraphOptions): Promise<Map<string, string[]>> {
  const { repoUrl, wants, depth, signal } = options;
  const base = repoUrl.replace(/\/+$/, '');
  const uniqueWants = [...new Set(wants)];
  if (uniqueWants.length === 0) return new Map();

  // v0 upload-request: wants (caps on the first), deepen, filter, flush, done.
  const caps = 'side-band-64k no-progress shallow filter agent=nostrhub';
  let request = '';
  uniqueWants.forEach((want, i) => {
    request += pktLine(i === 0 ? `want ${want} ${caps}\n` : `want ${want}\n`);
  });
  request += pktLine(`deepen ${depth}\n`);
  request += pktLine('filter tree:0\n');
  request += '0000';
  request += pktLine('done\n');

  const res = await fetch(`${base}/git-upload-pack`, {
    method: 'POST',
    // Only Content-Type: GRASP servers allow just that header cross-origin.
    headers: { 'Content-Type': 'application/x-git-upload-pack-request' },
    body: request,
    signal,
  });
  if (!res.ok) throw new Error(`git-upload-pack: HTTP ${res.status}`);
  const body = new Uint8Array(await res.arrayBuffer());

  // Demux: skip shallow/unshallow/ACK/NAK lines; band 1 carries the pack.
  const packChunks: Uint8Array[] = [];
  let packSize = 0;
  for (const line of pktLines(body)) {
    if (line === null || line.length === 0) continue;
    const band = line[0];
    if (band === 1) {
      packChunks.push(line.subarray(1));
      packSize += line.length - 1;
    } else if (band === 3) {
      throw new Error(`Remote error: ${decoder.decode(line.subarray(1))}`);
    }
    // band 2 (progress) and plain text lines (shallow/NAK/…) are skipped.
  }
  const pack = new Uint8Array(packSize);
  let off = 0;
  for (const chunk of packChunks) {
    pack.set(chunk, off);
    off += chunk.length;
  }

  return parseCommitPack(pack);
}

// ————————————————————————— pack parsing —————————————————————————

/**
 * The pako `Inflate` internals we rely on to find where a zlib stream ends
 * inside a packfile — stable pako 1.x API, but absent from `@types/pako`.
 */
interface InflateInternals {
  ended: boolean;
  err: number;
  msg: string;
  result: Uint8Array | string;
  strm: { avail_in: number };
  push(data: Uint8Array, mode: boolean | number): boolean;
}

/** Inflate one zlib stream inside `buf` at `start`; report where it ended. */
function inflateEntry(buf: Uint8Array, start: number): { out: Uint8Array; end: number } {
  const inflator = new pako.Inflate() as unknown as InflateInternals;
  const CHUNK = 65536;
  let pos = start;
  let fed = 0;
  while (!inflator.ended && pos < buf.length) {
    const chunk = buf.subarray(pos, Math.min(pos + CHUNK, buf.length));
    inflator.push(chunk, false);
    if (inflator.err) throw new Error(`inflate: ${inflator.msg}`);
    pos += chunk.length;
    fed += chunk.length;
  }
  if (!inflator.ended) throw new Error('inflate: unexpected end of pack');
  const consumed = fed - inflator.strm.avail_in;
  return { out: inflator.result as Uint8Array, end: start + consumed };
}

/** Apply a git delta (copy/insert instruction stream) to a base object. */
function applyDelta(base: Uint8Array, delta: Uint8Array): Uint8Array {
  let i = 0;
  const varint = (): number => {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      byte = delta[i++];
      result |= (byte & 0x7f) << shift;
      shift += 7;
    } while (byte & 0x80);
    return result;
  };
  varint(); // source size (unused)
  const targetSize = varint();
  const out = new Uint8Array(targetSize);
  let o = 0;
  while (i < delta.length) {
    const cmd = delta[i++];
    if (cmd & 0x80) {
      // Copy from base.
      let ofs = 0;
      let size = 0;
      if (cmd & 0x01) ofs = delta[i++];
      if (cmd & 0x02) ofs |= delta[i++] << 8;
      if (cmd & 0x04) ofs |= delta[i++] << 16;
      if (cmd & 0x08) ofs |= delta[i++] << 24;
      if (cmd & 0x10) size = delta[i++];
      if (cmd & 0x20) size |= delta[i++] << 8;
      if (cmd & 0x40) size |= delta[i++] << 16;
      if (size === 0) size = 0x10000;
      out.set(base.subarray(ofs, ofs + size), o);
      o += size;
    } else if (cmd > 0) {
      // Insert literal bytes.
      out.set(delta.subarray(i, i + cmd), o);
      o += cmd;
      i += cmd;
    } else {
      throw new Error('delta: invalid opcode 0');
    }
  }
  return out;
}

const TYPE_NAMES: Record<number, string> = { 1: 'commit', 2: 'tree', 3: 'blob', 4: 'tag' };

/** `sha1("<type> <len>\0" + data)` as hex — a git object id. */
async function objectOid(type: string, data: Uint8Array): Promise<string> {
  const header = encoder.encode(`${type} ${data.length}\0`);
  const full = new Uint8Array(header.length + data.length);
  full.set(header, 0);
  full.set(data, header.length);
  const digest = await crypto.subtle.digest('SHA-1', full);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Extract `parent <oid>` header lines from a raw commit object. */
function parseParents(commit: Uint8Array): string[] {
  const text = decoder.decode(commit);
  const headerEnd = text.indexOf('\n\n');
  const header = headerEnd === -1 ? text : text.slice(0, headerEnd);
  const parents: string[] = [];
  for (const line of header.split('\n')) {
    if (line.startsWith('parent ')) {
      const oid = line.slice('parent '.length).trim();
      if (OID_RE.test(oid)) parents.push(oid);
    }
  }
  return parents;
}

interface PackEntry {
  offset: number;
  type: number;
  data: Uint8Array;
  baseOffset?: number;
  baseOid?: string;
}

/** Parse a packfile into commit id → parent ids (non-commit objects ignored). */
async function parseCommitPack(pack: Uint8Array): Promise<Map<string, string[]>> {
  if (pack.length < 12 || decoder.decode(pack.subarray(0, 4)) !== 'PACK') {
    throw new Error('Not a packfile');
  }
  const view = new DataView(pack.buffer, pack.byteOffset, pack.byteLength);
  const count = view.getUint32(8);

  const entries: PackEntry[] = [];
  let pos = 12;

  for (let n = 0; n < count; n++) {
    const offset = pos;
    // Object header: type + size varint.
    let byte = pack[pos++];
    const type = (byte >> 4) & 0x7;
    while (byte & 0x80) byte = pack[pos++];

    const entry: PackEntry = { offset, type, data: new Uint8Array(0) };

    if (type === 6) {
      // ofs-delta: negative offset varint (base appears earlier in the pack).
      byte = pack[pos++];
      let ofs = byte & 0x7f;
      while (byte & 0x80) {
        byte = pack[pos++];
        ofs = ((ofs + 1) << 7) | (byte & 0x7f);
      }
      entry.baseOffset = offset - ofs;
    } else if (type === 7) {
      // ref-delta: 20-byte base object id.
      entry.baseOid = [...pack.subarray(pos, pos + 20)]
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      pos += 20;
    }

    const { out, end } = inflateEntry(pack, pos);
    entry.data = out;
    pos = end;
    entries.push(entry);
  }

  // Resolve deltas in passes (bases can themselves be deltas).
  const byOffset = new Map<number, { type: number; data: Uint8Array }>();
  const byOid = new Map<string, { type: number; data: Uint8Array }>();
  const graph = new Map<string, string[]>();

  const record = async (offset: number, type: number, data: Uint8Array) => {
    byOffset.set(offset, { type, data });
    const typeName = TYPE_NAMES[type];
    if (!typeName) return;
    const oid = await objectOid(typeName, data);
    byOid.set(oid, { type, data });
    if (type === 1) graph.set(oid, parseParents(data));
  };

  let pending = entries;
  while (pending.length > 0) {
    const next: PackEntry[] = [];
    for (const entry of pending) {
      if (entry.type >= 1 && entry.type <= 4) {
        await record(entry.offset, entry.type, entry.data);
        continue;
      }
      const resolvedBase =
        entry.baseOffset !== undefined
          ? byOffset.get(entry.baseOffset)
          : entry.baseOid
            ? byOid.get(entry.baseOid)
            : undefined;
      if (!resolvedBase) {
        next.push(entry);
        continue;
      }
      await record(entry.offset, resolvedBase.type, applyDelta(resolvedBase.data, entry.data));
    }
    if (next.length === pending.length) break; // unresolvable (thin-pack base?)
    pending = next;
  }

  return graph;
}
