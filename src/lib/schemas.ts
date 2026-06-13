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
  ai: AISettingsSchema,
}) satisfies z.ZodType<AppConfig>;

// ─── Encrypted settings schema (NIP-78, kind 30078) ───────────────────

/**
 * Cross-device app settings synced via an encrypted kind 30078 event. A subset
 * of AppConfig — device-local secrets (the AI apiKey) are excluded. All fields
 * are optional so partial snapshots validate.
 */
export const EncryptedSettingsSchema = z.object({
  theme: ThemeSchema.optional(),
  experts: z.array(z.string()).optional(),
  communityCap: z.number().nullable().optional(),
  statsProvider: z.string().optional(),
  useAppBlossomServers: z.boolean().optional(),
  /** Logical clock: ms timestamp of the last write, used to order cross-device updates. */
  lastSync: z.number().optional(),
});

export type EncryptedSettings = z.infer<typeof EncryptedSettingsSchema>;
