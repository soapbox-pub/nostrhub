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

/**
 * Build `src/sw/worker.ts` into a single self-contained `/sw.js`.
 *
 * A second, separate build rather than another input to the app's: the app
 * build splits shared code into chunks, and a worker that imports chunks has
 * to be registered as a module. As one IIFE the worker stays a classic script
 * at a fixed, unhashed root path — the only place a `/`-scoped worker can
 * live. In dev it's rebuilt on every request for it.
 */
const SERVICE_WORKER_FILE = "sw.js";
const SERVICE_WORKER_ENTRY = path.resolve(__dirname, "src/sw/worker.ts");

async function buildServiceWorker(mode: string): Promise<string> {
  const dev = mode === "development";
  const result = await build({
    configFile: false,
    mode,
    logLevel: "warn",
    publicDir: false,
    resolve: {
      alias: [{ find: "@", replacement: path.resolve(__dirname, "./src") }],
    },
    define: {
      "process.env.NODE_ENV": JSON.stringify(dev ? "development" : "production"),
    },
    build: {
      write: false,
      target: "esnext",
      minify: !dev,
      sourcemap: false,
      emptyOutDir: false,
      copyPublicDir: false,
      reportCompressedSize: false,
      lib: {
        entry: SERVICE_WORKER_ENTRY,
        formats: ["iife"],
        name: "nostrhubServiceWorker",
        fileName: () => SERVICE_WORKER_FILE,
      },
    },
  });

  for (const output of Array.isArray(result) ? result : [result]) {
    if (!("output" in output)) continue;
    const entry = output.output.find((file) => file.type === "chunk" && file.isEntry);
    if (entry?.type === "chunk") return entry.code;
  }
  throw new Error("Service worker build produced no entry chunk");
}

function serviceWorker(): Plugin {
  let mode = "production";

  return {
    name: "nostrhub:service-worker",

    configResolved(config) {
      mode = config.mode;
    },

    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url) return next();
        const { pathname } = new URL(req.url, "http://localhost");
        if (pathname !== `/${SERVICE_WORKER_FILE}`) return next();

        buildServiceWorker(mode).then((code) => {
          res.setHeader("Content-Type", "text/javascript; charset=utf-8");
          res.setHeader("Cache-Control", "no-cache");
          res.end(code);
        }, next);
      });
    },

    async generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: SERVICE_WORKER_FILE,
        source: await buildServiceWorker(mode),
      });
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
    serviceWorker(),
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