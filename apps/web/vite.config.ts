import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * A plain single-page app — no MV3-style dual build pass needed here,
 * unlike apps/extension (ADR-0007). See ADR-0021.
 */
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
  },
});
