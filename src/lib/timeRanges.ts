/** Seconds in common time periods. */
export const HOUR = 3600;
export const DAY = 86400;
export const WEEK = 7 * DAY;
export const MONTH = 30 * DAY;

/**
 * Unix timestamp for N seconds ago, snapped to the start of the hour so the
 * value is stable across re-renders (keeps React Query keys stable).
 */
export function ago(seconds: number): number {
  const raw = Math.floor(Date.now() / 1000) - seconds;
  return Math.floor(raw / HOUR) * HOUR;
}
