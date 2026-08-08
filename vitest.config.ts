import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["{apps,packages,services,tests}/**/src/**/*.{test,spec}.{ts,tsx}"],
    environment: "node",
  },
});
