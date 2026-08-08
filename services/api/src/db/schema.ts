import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

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
