import { sql } from "drizzle-orm";

import type { Database } from "./client.js";

/**
 * `CREATE TABLE IF NOT EXISTS`, not a migrations framework — this is one
 * schema, unversioned so far (no released data to migrate away from
 * yet). Reach for `drizzle-kit`'s real migration tooling once there's an
 * actual schema change to apply against data that already exists;
 * building that machinery now, with nothing to migrate, would be
 * exactly the premature abstraction CLAUDE.md §16.2 warns against.
 */
export async function ensureSchema(db: Database): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL
    )
  `);
}
