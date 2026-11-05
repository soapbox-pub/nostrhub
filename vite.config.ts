import path from "node:path";

import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { build, type Plugin } from "vite";
import { defineConfig } from "vitest/config";

/**
 * Build `src/npanel/preview.ts` into `/.well-known/npanel/preview.js`: the
 * script npanel runs to show crawlers NostrHub's link previews (see its
 * header). One self-contained ES module, since npanel's scripts import
 * nothing.
 */
const NPANEL_PREVIEW_FILE = ".well-known/npanel/preview.js";
const NPANEL_PREVIEW_ENTRY = path.resolve(__dirname, "src/npanel/preview.ts");

async function buildNpanelPreview(mode: string): Promise<string> {
  const result = await build({
    configFile: false,
    mode,
    logLevel: "warn",
    publicDir: false,
    resolve: {
      alias: [{ find: "@", replacement: path.resolve(__dirname, "./src") }],
      // npanel's sandbox has no DOM, like a worker: a package whose `browser`
      // build reaches for `document` is given its plain one.
      conditions: ["worker", "module", "import", "default"],
    },
    build: {
      write: false,
      target: "es2022",
      // Fewer bytes for QuickJS to parse on every preview.
      minify: mode !== "development",
      sourcemap: false,
      emptyOutDir: false,
      copyPublicDir: false,
      reportCompressedSize: false,
      rolldownOptions: {
        // A package is only what's used of it: barrels like Nostrify's would
        // otherwise run every module they re-export on every preview.
        treeshake: { moduleSideEffects: (id: string) => !id.includes("/node_modules/") },
      },
      lib: {
        entry: NPANEL_PREVIEW_ENTRY,
        formats: ["es"],
        fileName: () => "preview.js",
      },
    },
  });

  for (const output of Array.isArray(result) ? result : [result]) {
    if (!("output" in output)) continue;
    const entry = output.output.find((file) => file.type === "chunk" && file.isEntry);
    if (entry?.type === "chunk") return entry.code;
  }
  throw new Error("npanel preview build produced no entry chunk");
}

function npanelPreview(): Plugin {
  let mode = "production";
  return {
    name: "nostrhub:npanel-preview",
    apply: "build",
    configResolved(config) {
      mode = config.mode;
    },
    async generateBundle() {
      this.emitFile({ type: "asset", fileName: NPANEL_PREVIEW_FILE, source: await buildNpanelPreview(mode) });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(() => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    tailwindcss(),
    npanelPreview(),
  ],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/{vite,eslint}.config.*',
      '.agents/**',
    ],
    onConsoleLog(log) {
      return !log.includes("React Router Future Flag Warning");
    },
    env: {
      DEBUG_PRINT_LIMIT: '0', // Suppress DOM output that exceeds AI context windows
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // The package only declares a "module" field (no "main"/"exports"),
      // which Vite's import-analysis can't resolve from a bare specifier in
      // dev/test. Point directly at the ESM entry so it resolves everywhere.
      "@plausible-analytics/tracker": path.resolve(
        __dirname,
        "./node_modules/@plausible-analytics/tracker/plausible.js",
      ),
    },
  },
}));