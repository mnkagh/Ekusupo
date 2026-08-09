import { mkdirSync } from "node:fs";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";

import * as schema from "./schema.js";

/**
 * `pglite` — a real, WASM-compiled Postgres running embedded, not a
 * mock or an in-memory stand-in. See ADR-0024 for why: this environment
 * has no Docker and no installed Postgres, so this is the only way to
 * run and verify real SQL here. `dataDir` omitted (or `undefined`) runs
 * fully in-memory (fast, ephemeral — what tests use); a real path
 * persists to disk across restarts (what `index.ts` uses for the actual
 * running server).
 */
export function createDb(dataDir?: string) {
  return createDbFromClient(createPgliteClient(dataDir));
}

/** Wraps an existing client, so a caller holding one doesn't open a second instance on the same directory. */
export function createDbFromClient(client: PGlite) {
  return drizzle(client, { schema });
}

/**
 * The underlying `PGlite` instance, without Drizzle wrapped around it.
 * Only `db/serve.ts` needs this — the socket server speaks the Postgres
 * wire protocol directly and has no use for a query builder. Everything
 * else should go through `createDb`.
 */
export function createPgliteClient(dataDir?: string): PGlite {
  // pglite's own directory creation isn't recursive — it errors if the
  // parent doesn't already exist (found by actually restarting a real
  // server against a fresh checkout, not just running `tsc`).
  if (dataDir) mkdirSync(dataDir, { recursive: true });

  return new PGlite(dataDir);
}

export type Database = ReturnType<typeof createDb>;
