/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Plausible Analytics domain. Empty/undefined disables analytics. */
  readonly VITE_PLAUSIBLE_DOMAIN?: string;
  /** Plausible Analytics API endpoint (optional; for self-hosted instances). */
  readonly VITE_PLAUSIBLE_ENDPOINT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module '@fontsource-variable/inter';
declare module '@fontsource-variable/jetbrains-mono';
declare module '@fontsource-variable/space-grotesk';
