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

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS provider_connections (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      encrypted_tokens TEXT NOT NULL,
      connected_at TIMESTAMPTZ NOT NULL,
      UNIQUE (user_id, provider)
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS transfer_jobs (
      id TEXT PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      source_provider TEXT NOT NULL,
      destination_provider TEXT NOT NULL,
      source_playlist_id TEXT NOT NULL,
      dry_run BOOLEAN NOT NULL,
      report JSONB,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    )
  `);

  // `CREATE TABLE IF NOT EXISTS` above does nothing to a table that
  // already exists, so a column added after the fact needs its own
  // statement — otherwise anyone with a database from before this change
  // keeps a table without it. Still not a migrations framework: additive,
  // idempotent, and safe to run on every boot. The moment a change is
  // *not* expressible this way (a rename, a backfill, a narrowing), that
  // is the signal to adopt drizzle-kit rather than to get clever here.
  await db.execute(sql`
    ALTER TABLE transfer_jobs ADD COLUMN IF NOT EXISTS upf_document JSONB
  `);

  await db.execute(sql`
    ALTER TABLE transfer_jobs ADD COLUMN IF NOT EXISTS progress JSONB
  `);
}

/**
 * Transfers run in this process (ADR-0033), so a job that was mid-flight
 * when the server stopped has no one left to finish it. Its row still
 * says `running`, which would leave a client polling forever for a
 * result that is never coming.
 *
 * Marking those failed at boot is the honest outcome: the work really did
 * stop, and saying so lets the user retry. Resuming instead (CLAUDE.md
 * §9.3's "resume where feasible") needs to know how far the writes got,
 * which nothing records yet.
 *
 * Safe to run at every boot because it only touches non-terminal rows,
 * and nothing is running yet when it does.
 */
export async function failInterruptedJobs(db: Database): Promise<number> {
  const result = await db.execute(sql`
    UPDATE transfer_jobs
       SET status = 'failed',
           updated_at = NOW(),
           report = COALESCE(report, '{}'::jsonb) || jsonb_build_object(
             'failureReason',
             'Interrupted by a server restart before it finished. Nothing further was written; run it again.'
           )
     WHERE status IN ('pending', 'running')
  `);
  return result.affectedRows ?? 0;
}
