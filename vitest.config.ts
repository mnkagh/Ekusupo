import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["{apps,packages,services}/*/src/**/*.{test,spec}.ts"],
    environment: "node",
  },
});
