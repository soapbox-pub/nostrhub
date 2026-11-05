/**
 * Canonical origin used to build chat topic URLs. In a module of its own so
 * code that runs outside React (the service worker, via `eventRouting.ts`)
 * can read it without pulling in `chat.ts`'s hooks.
 */
export const CHAT_ORIGIN = 'https://nostrhub.io';
