import { z } from 'zod';
import type {
  AppConfig,
  RelayMetadata,
  BlossomServerMetadata,
  AISettings,
} from '@/contexts/AppContext';

// ─── Theme schema ─────────────────────────────────────────────────────

export const ThemeSchema = z.enum(['dark', 'light', 'system', 'ditto']);

// ─── Metadata schemas ─────────────────────────────────────────────────

export const RelayMetadataSchema = z.object({
  relays: z.array(z.object({
    url: z.url(),
    read: z.boolean(),
    write: z.boolean(),
  })),
  updatedAt: z.number(),
}) satisfies z.ZodType<RelayMetadata>;

export const BlossomServerMetadataSchema = z.object({
  servers: z.array(z.url()),
  updatedAt: z.number(),
}) satisfies z.ZodType<BlossomServerMetadata>;

export const AISettingsSchema = z.object({
  baseURL: z.string(),
  model: z.string(),
  apiKey: z.string(),
}) satisfies z.ZodType<AISettings>;

// ─── App config schema ────────────────────────────────────────────────

export const AppConfigSchema = z.object({
  appName: z.string(),
  appId: z.string(),
  theme: ThemeSchema,
  relayMetadata: RelayMetadataSchema,
  blossomServerMetadata: BlossomServerMetadataSchema,
  useAppBlossomServers: z.boolean(),
  experts: z.array(z.string()),
  communityCap: z.number().nullable(),
  statsProvider: z.string(),
  statsRelay: z.string(),
  searchRelays: z.array(z.string()),
  zapstoreRelays: z.array(z.string()),
  ai: AISettingsSchema,
}) satisfies z.ZodType<AppConfig>;

// ─── Encrypted settings schema (NIP-78, kind 30078) ───────────────────

/**
 * Notification read-state.
 *
 * `cursor` is a Unix timestamp (seconds) of the most recently *viewed*
 * notification. Anything newer than the cursor is considered unread.
 */
export const NotificationSettingsSchema = z
  .object({
    /** Unix timestamp (seconds) of the last viewed notification. */
    cursor: z.number().optional(),
  })
  .passthrough();

/**
 * Cross-device app settings synced via an encrypted kind 30078 event. A subset
 * of AppConfig — device-local secrets (the AI apiKey) are excluded. All fields
 * are optional so partial snapshots validate.
 *
 * The schema is intentionally permissive (`.passthrough()`) so that fields
 * written by a newer client version survive a read-modify-write performed by
 * an older client.
 */
export const EncryptedSettingsSchema = z
  .object({
    theme: ThemeSchema.optional(),
    experts: z.array(z.string()).optional(),
    communityCap: z.number().nullable().optional(),
    statsProvider: z.string().optional(),
    useAppBlossomServers: z.boolean().optional(),
    statsRelay: z.string().optional(),
    searchRelays: z.array(z.string()).optional(),
    zapstoreRelays: z.array(z.string()).optional(),
    /** Notification read-state. */
    notifications: NotificationSettingsSchema.optional(),
    /** Logical clock: ms timestamp of the last write, used to order cross-device updates. */
    lastSync: z.number().optional(),
  })
  .passthrough();

export type NotificationSettings = z.infer<typeof NotificationSettingsSchema>;
export type EncryptedSettings = z.infer<typeof EncryptedSettingsSchema>;
