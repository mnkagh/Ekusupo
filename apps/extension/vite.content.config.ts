import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";

import { outDirFor, targetFromEnv } from "./src/build-target.js";

/**
 * Isolated build pass for the content script only. Manifest V3 content
 * scripts execute as classic scripts, not modules — if this ever shared a
 * build pass with popup/options/background, Rollup would eventually
 * extract a shared chunk into content.js and the browser would throw a
 * SyntaxError on the resulting `import` statement at injection time. See
 * ADR-0007. `emptyOutDir: false` so this pass doesn't wipe out
 * vite.config.ts's output — run after it, not instead of it, and into
 * whichever folder that pass targeted.
 */
const dir = fileURLToPath(new URL(".", import.meta.url));
const outDir = outDirFor(targetFromEnv(process.env.EKUSUPO_BROWSER));

export default defineConfig({
  publicDir: false,
  build: {
    outDir,
    emptyOutDir: false,
    lib: {
      entry: `${dir}src/content/content-script.ts`,
      name: "EkusupoContentScript",
      formats: ["iife"],
      fileName: () => "content.js",
    },
  },
});
