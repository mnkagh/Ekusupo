import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

import { buildManifest } from "./src/manifest.js";
import { outDirFor, targetFromEnv } from "./src/build-target.js";

/**
 * Main build pass: popup, options, and the background script. All three
 * are safe to build as normal ES modules with standard Rollup chunking —
 * both Chrome's MV3 service worker and Firefox's MV3 event page support
 * `"type": "module"`. The content script does NOT belong here; see
 * vite.content.config.ts and ADR-0007 for why it needs its own isolated
 * build.
 *
 * `EKUSUPO_BROWSER=firefox` switches the manifest and the output folder;
 * everything else about the build is identical between targets.
 */
const dir = fileURLToPath(new URL(".", import.meta.url));
const target = targetFromEnv(process.env.EKUSUPO_BROWSER);

/**
 * Emitted through Rollup rather than copied from public/ so there is
 * exactly one source of truth for the manifest, and so it is impossible
 * to ship a Firefox folder carrying Chrome's manifest.
 */
function emitManifest(): Plugin {
  return {
    name: "ekusupo-emit-manifest",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "manifest.json",
        source: JSON.stringify(buildManifest(target), null, 2) + "\n",
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), emitManifest()],
  publicDir: false,
  build: {
    outDir: outDirFor(target),
    rollupOptions: {
      input: {
        popup: `${dir}popup.html`,
        options: `${dir}options.html`,
        background: `${dir}src/background/service-worker.ts`,
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name].js",
        assetFileNames: "assets/[name][extname]",
      },
    },
  },
});
