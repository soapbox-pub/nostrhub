/**
 * Community chat is a thin layer over NIP-22 (kind 1111) comments.
 *
 * Each chat "channel" is a topic addressed by a canonical URL of the form
 * `https://nostrhub.io/chat/<topic>`. Messages are kind 1111 events whose root
 * `I` tag points at that URL (with `K=web`). Because they are plain NIP-22
 * comments on a public URL, every message is publicly readable by any client;
 * the "community" simply scopes which authors we display.
 *
 * The canonical origin is fixed (not `location.origin`) so that messages are
 * interoperable across deployments and local development.
 */

/** Canonical origin used to build chat topic URLs. */
export const CHAT_ORIGIN = 'https://nostrhub.io';

/** The channel shown when visiting `/chat` with no topic. */
export const DEFAULT_TOPIC = 'general';

export interface ChatChannel {
  /** URL-safe topic slug, e.g. "general". */
  topic: string;
  /** Human-readable channel name shown in the sidebar. */
  label: string;
  /** Short one-line purpose shown in the channel header. */
  description: string;
}

/** The curated set of community channels. */
export const CHAT_CHANNELS: ChatChannel[] = [
  {
    topic: 'general',
    label: 'general',
    description: 'Community-wide chatter and introductions.',
  },
  {
    topic: 'development',
    label: 'development',
    description: 'Implementation talk: clients, relays, libraries.',
  },
  {
    topic: 'nips',
    label: 'nips',
    description: 'Discuss proposals and improvements to the protocol.',
  },
  {
    topic: 'relays',
    label: 'relays',
    description: 'Running, scaling, and discovering relays.',
  },
  {
    topic: 'design',
    label: 'design',
    description: 'UX, interfaces, and product direction.',
  },
  {
    topic: 'random',
    label: 'random',
    description: 'Anything that does not fit elsewhere.',
  },
];

/** Normalize a raw topic param into a safe lowercase slug. */
export function normalizeTopic(raw: string | undefined): string {
  const slug = (raw ?? '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
  return slug || DEFAULT_TOPIC;
}

/** Look up channel metadata for a topic, falling back to a generic entry. */
export function getChannel(topic: string): ChatChannel {
  return (
    CHAT_CHANNELS.find((c) => c.topic === topic) ?? {
      topic,
      label: topic,
      description: 'Community channel.',
    }
  );
}

/** The NIP-22 root URL for a chat topic. */
export function chatTopicUrl(topic: string): URL {
  return new URL(`${CHAT_ORIGIN}/chat/${normalizeTopic(topic)}`);
}
