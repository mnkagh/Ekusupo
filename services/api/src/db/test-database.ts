import { ensureSchema } from "./bootstrap.js";
import { createDbFromClient, createPgliteClient } from "./client.js";
import type { Database } from "./client.js";

export interface TestDatabase {
  db: Database;
  /**
   * Frees the embedded Postgres. Call it from `afterEach` — an instance
   * left open holds its whole WASM heap until the worker exits.
   */
  close: () => Promise<void>;
}

/**
 * A fresh in-memory Postgres with the schema already applied, plus the
 * means to shut it down again.
 *
 * `createDb()` deliberately hands back only the Drizzle wrapper, which
 * leaves no way to reach the underlying instance and close it. Tests
 * that called it therefore stranded one WASM Postgres heap per test;
 * once a run had accumulated enough of them the setup for the next one
 * started timing out at random. Handing the closer back with the
 * database is what makes cleanup possible at all.
 */
export async function createTestDatabase(): Promise<TestDatabase> {
  const client = createPgliteClient();
  const db = createDbFromClient(client);
  await ensureSchema(db);
  return { db, close: () => client.close() };
}
