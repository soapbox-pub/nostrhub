import { createContext } from "react";
import type { ThemeConfig, ThemesConfig } from "@/themes";

/**
 * App theme preference.
 * - "light" / "dark" — builtin (or configured) color sets.
 * - "system" — resolves to "light" or "dark" via prefers-color-scheme.
 * - "custom" — user-defined colors stored in `customTheme`.
 */
export type Theme = "dark" | "light" | "system" | "custom";

export interface RelayMetadata {
  /** List of relays with read/write permissions */
  relays: { url: string; read: boolean; write: boolean }[];
  /** Unix timestamp of when the relay list was last updated */
  updatedAt: number;
}

/**
 * Configuration for the OpenAI-compatible AI provider used by the in-chat
 * `@ai` assistant. The request is made directly from the browser to
 * `baseURL`, so the API key is exposed to anyone with access to this device.
 */
export interface AISettings {
  /** OpenAI-compatible API base URL, e.g. `https://api.openai.com/v1`. */
  baseURL: string;
  /** Model identifier passed to the chat completions endpoint. */
  model: string;
  /** API key (stored in plaintext in localStorage — treat as a local secret). */
  apiKey: string;
}

/** Blossom server list metadata (BUD-03 / kind 10063), mirroring RelayMetadata for parity. */
export interface BlossomServerMetadata {
  /** Ordered list of Blossom server URLs (most trusted/reliable first per BUD-03). */
  servers: string[];
  /** Unix timestamp of when the server list was last updated (from kind 10063 created_at). */
  updatedAt: number;
}

export interface AppConfig {
  /** Application display name used in UI text and the NIP-78 metadata title. Default: "NostrHub". */
  appName: string;
  /** Application identifier, used as a prefix for app-specific metadata (NIP-78 d-tags). Default: "nostrhub". */
  appId: string;
  /** Current theme mode. */
  theme: Theme;
  /** Custom theme config (colors, fonts, background). Only used when theme === "custom". */
  customTheme?: ThemeConfig;
  /** Automatically publish custom theme changes to the user's profile (kind 16767). Default: true. */
  autoShareTheme: boolean;
  /** Configured light and dark themes. Overrides the builtin themes when set. */
  themes?: ThemesConfig;
  /** NIP-65 relay list metadata */
  relayMetadata: RelayMetadata;
  /** User's kind 10063 Blossom server list. */
  blossomServerMetadata: BlossomServerMetadata;
  /**
   * When true, the app's default Blossom servers are merged with the user's
   * servers (app servers first, deduped). When false, only the user's servers
   * are used.
   */
  useAppBlossomServers: boolean;
  /**
   * Hex pubkeys of the user's configured "Nostr Experts". These users are
   * visually distinguished (🎓) and anchor the app's trust model: their NIP
   * approvals are counted for ranking, and their follow lists derive the
   * community author set used to filter discussion.
   */
  experts: string[];
  /**
   * Maximum size of the derived community author set (experts' most-followed
   * follows, used as the discussion `authors` filter). `null` disables the cap
   * entirely. Experts and the logged-in user are always included regardless.
   */
  communityCap: number | null;
  /** Hex pubkey of the NIP-85 trusted-assertions provider used for network stats. */
  statsProvider: string;
  /** OpenAI-compatible AI provider config for the in-chat `@ai` assistant. */
  ai: AISettings;
}

export interface AppContextType {
  /** Current application configuration */
  config: AppConfig;
  /** Update configuration using a callback that receives current config and returns new config */
  updateConfig: (updater: (currentConfig: Partial<AppConfig>) => Partial<AppConfig>) => void;
}

export const AppContext = createContext<AppContextType | undefined>(undefined);
