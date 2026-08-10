import { eq } from "drizzle-orm";

import type { Database } from "../db/client.js";
import { sessionsTable } from "../db/schema.js";
import type { SessionStore } from "./session-store.js";
import type { Session } from "./session.js";

function toSession(row: typeof sessionsTable.$inferSelect): Session {
  return {
    id: row.id,
    userId: row.userId,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
  };
}

/** Real implementation of `SessionStore` (ADR-0022) — see ADR-0024. */
export class PostgresSessionStore implements SessionStore {
  constructor(private readonly db: Database) {}

  async create(session: Session): Promise<void> {
    await this.db.insert(sessionsTable).values({
      id: session.id,
      userId: session.userId,
      createdAt: new Date(session.createdAt),
      expiresAt: new Date(session.expiresAt),
    });
  }

  async get(id: string): Promise<Session | undefined> {
    const [row] = await this.db.select().from(sessionsTable).where(eq(sessionsTable.id, id));
    return row ? toSession(row) : undefined;
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(sessionsTable).where(eq(sessionsTable.id, id));
  }

  async deleteForUser(userId: string): Promise<void> {
    await this.db.delete(sessionsTable).where(eq(sessionsTable.userId, userId));
  }
}
