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
    //
    // Generous rather than tight, because the floor is not this machine.
    // A CI runner is a shared two-core box, and a WASM compile there can
    // take several times what it takes locally. A timeout that only
    // passes on a fast laptop turns every slow run into a red build that
    // says nothing about the code.
    testTimeout: 60_000,
    // Setup pays that same compile — a `beforeEach` opening a database
    // needs the same headroom as the test that uses it.
    hookTimeout: 60_000,
  },
});
