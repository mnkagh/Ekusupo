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
  // pglite's own directory creation isn't recursive — it errors if the
  // parent doesn't already exist (found by actually restarting a real
  // server against a fresh checkout, not just running `tsc`).
  if (dataDir) mkdirSync(dataDir, { recursive: true });

  const client = new PGlite(dataDir);
  return drizzle(client, { schema });
}

export type Database = ReturnType<typeof createDb>;
