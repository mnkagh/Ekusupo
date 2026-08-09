import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["{apps,packages,services,tests}/**/src/**/*.{test,spec}.{ts,tsx}"],
    environment: "node",
    // `services/api` tests run against real embedded Postgres (`pglite`,
    // ADR-0024), and the first instance in each worker pays a one-time
    // WASM compile that alone can exceed vitest's 5s default. These are
    // real integration tests, not unit tests — the default is the wrong
    // shape for them, so raise it rather than fake the database.
    testTimeout: 30_000,
  },
});
