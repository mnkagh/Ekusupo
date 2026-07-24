import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * Main build pass: popup, options, and the background service worker.
 * All three are safe to build as normal ES modules with standard Rollup
 * chunking — Chrome MV3 background workers support `"type": "module"`.
 * The content script does NOT belong here; see vite.content.config.ts
 * and ADR-0007 for why it needs its own isolated build.
 */
const dir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  plugins: [react()],
  publicDir: "public",
  build: {
    outDir: "dist",
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
