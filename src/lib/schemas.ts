import { z } from 'zod';
import type {
  AppConfig,
  RelayMetadata,
  BlossomServerMetadata,
  AISettings,
} from '@/contexts/AppContext';
import type {
  CoreThemeColors,
  ThemeConfig,
  ThemeFont,
  ThemeBackground,
  ThemesConfig,
} from '@/themes';

// ─── Theme schemas ────────────────────────────────────────────────────

export const ThemeSchema = z.enum(['dark', 'light', 'system', 'custom']);

export const CoreThemeColorsSchema = z.object({
  background: z.string(),
  text: z.string(),
  primary: z.string(),
}) satisfies z.ZodType<CoreThemeColors>;

export const ThemeFontSchema = z.object({
  family: z.string(),
  url: z.string().optional(),
}) satisfies z.ZodType<ThemeFont>;

export const ThemeBackgroundSchema = z.object({
  url: z.string(),
  mode: z.enum(['cover', 'tile']).optional(),
  dimensions: z.string().optional(),
  mimeType: z.string().optional(),
  blurhash: z.string().optional(),
}) satisfies z.ZodType<ThemeBackground>;

export const ThemeConfigSchema = z.object({
  title: z.string().optional(),
  colors: CoreThemeColorsSchema,
  font: ThemeFontSchema.optional(),
  titleFont: ThemeFontSchema.optional(),
  background: ThemeBackgroundSchema.optional(),
}) satisfies z.ZodType<ThemeConfig>;

export const ThemesConfigSchema = z.object({
  light: ThemeConfigSchema,
  dark: ThemeConfigSchema,
}) satisfies z.ZodType<ThemesConfig>;

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
  customTheme: ThemeConfigSchema.optional(),
  autoShareTheme: z.boolean(),
  themes: ThemesConfigSchema.optional(),
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
 * Cross-device app settings synced via an encrypted kind 30078 event. This is a
 * subset of AppConfig — device-local secrets (the AI apiKey) are intentionally
 * excluded. All fields are optional so partial snapshots validate.
 */
export const EncryptedSettingsSchema = z.object({
  theme: ThemeSchema.optional(),
  customTheme: ThemeConfigSchema.optional(),
  autoShareTheme: z.boolean().optional(),
  experts: z.array(z.string()).optional(),
  communityCap: z.number().nullable().optional(),
  statsProvider: z.string().optional(),
  useAppBlossomServers: z.boolean().optional(),
  /** Logical clock: ms timestamp of the last write, used to order cross-device updates. */
  lastSync: z.number().optional(),
});

export type EncryptedSettings = z.infer<typeof EncryptedSettingsSchema>;
