/**
 * One-shot relay lookups. Each opens a socket, asks for one event and hangs
 * up — a worker lives for seconds per push, so a pool's long-lived,
 * reconnecting connections would be all cost and no benefit.
 */

import type { NostrFilter } from '@nostrify/nostrify';

/** Relays asked at once. */
const RELAY_FANOUT = 4;

/**
 * Ask one relay for one event over a short-lived socket. Resolves with the
 * first `EVENT` it sends, or null on EOSE, error, close or timeout — it never
 * rejects, because every caller would rather show something than nothing.
 * What comes back is whatever the relay sent: callers validate it.
 */
function requestEvent(relay: string, filter: NostrFilter, timeoutMs: number): Promise<unknown> {
  return new Promise((resolve) => {
    let socket: WebSocket | undefined;
    let settled = false;

    const finish = (event: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        socket?.close();
      } catch { /* already gone */ }
      resolve(event ?? null);
    };

    const timer = setTimeout(() => finish(null), timeoutMs);

    try {
      socket = new WebSocket(relay);
    } catch {
      return finish(null);
    }

    const subId = `sw-${Math.random().toString(36).slice(2, 10)}`;
    socket.onopen = () => socket?.send(JSON.stringify(['REQ', subId, { ...filter, limit: 1 }]));
    socket.onmessage = (message) => {
      let frame: unknown;
      try {
        frame = JSON.parse(message.data);
      } catch {
        return;
      }
      if (!Array.isArray(frame) || frame[1] !== subId) return;
      if (frame[0] === 'EVENT' && frame[2] && typeof frame[2] === 'object') finish(frame[2]);
      else if (frame[0] === 'CLOSED' || frame[0] === 'EOSE') finish(null);
    };
    socket.onerror = () => finish(null);
    socket.onclose = () => finish(null);
  });
}

/**
 * Ask several relays at once and take the first answer `accept` turns into a
 * `T`. One slow or empty relay doesn't spend the others' budget.
 */
export async function requestEventFromAny<T>(
  relays: string[],
  filter: NostrFilter,
  timeoutMs: number,
  accept: (candidate: unknown) => T | null,
): Promise<T | null> {
  const targets = relays.filter((url) => /^wss:\/\//i.test(url)).slice(0, RELAY_FANOUT);
  if (!targets.length) return null;
  try {
    return await Promise.any(targets.map(async (relay) => {
      const accepted = accept(await requestEvent(relay, filter, timeoutMs));
      if (accepted === null) throw new Error('no match');
      return accepted;
    }));
  } catch {
    return null;
  }
}
