import { boolean, jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import type { TransferReport } from "@ekusupo/core";

/**
 * The real schema behind `UserStore`/`SessionStore` (ADR-0022) — see
 * ADR-0024 for why this runs on `pglite` (embedded, real Postgres) in
 * this environment rather than a hosted instance.
 */
export const usersTable = pgTable("users", {
  id: uuid("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const sessionsTable = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

/**
 * `encryptedTokens` holds a JSON-serialized `@ekusupo/connector-sdk`
 * `AuthSession`, encrypted (`providers/token-encryption.ts`, ADR-0025) —
 * never a plaintext token at rest (CLAUDE.md §12.1). One connection per
 * user per provider.
 */
export const providerConnectionsTable = pgTable(
  "provider_connections",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    encryptedTokens: text("encrypted_tokens").notNull(),
    connectedAt: timestamp("connected_at", { withTimezone: true }).notNull(),
  },
  (table) => [unique().on(table.userId, table.provider)],
);

/**
 * `report` is null until the job finishes (ADR-0027) — `runDryRunTransfer`
 * (`@ekusupo/core`) only returns a `TransferReport` once it resolves, and
 * the job row is created up front so its live status is queryable while
 * still running.
 */
export const transferJobsTable = pgTable("transfer_jobs", {
  id: text("id").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  status: text("status").notNull(),
  sourceProvider: text("source_provider").notNull(),
  destinationProvider: text("destination_provider").notNull(),
  sourcePlaylistId: text("source_playlist_id").notNull(),
  dryRun: boolean("dry_run").notNull(),
  report: jsonb("report").$type<TransferReport>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});
