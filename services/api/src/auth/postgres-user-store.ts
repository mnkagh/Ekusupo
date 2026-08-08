import { eq, sql } from "drizzle-orm";

import type { Database } from "../db/client.js";
import { usersTable } from "../db/schema.js";
import type { UserStore } from "./user-store.js";
import type { User } from "./user.js";

function toUser(row: typeof usersTable.$inferSelect): User {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.passwordHash,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Real implementation of `UserStore` (ADR-0022) — see ADR-0024. */
export class PostgresUserStore implements UserStore {
  constructor(private readonly db: Database) {}

  async create(user: User): Promise<void> {
    await this.db.insert(usersTable).values({
      id: user.id,
      email: user.email,
      passwordHash: user.passwordHash,
      createdAt: new Date(user.createdAt),
    });
  }

  async findByEmail(email: string): Promise<User | undefined> {
    // Stored with whatever casing the user signed up with (so it
    // displays back the same way); compared case-insensitively, same
    // behavior `InMemoryUserStore` already had.
    const [row] = await this.db
      .select()
      .from(usersTable)
      .where(sql`lower(${usersTable.email}) = ${email.toLowerCase()}`);
    return row ? toUser(row) : undefined;
  }

  async findById(id: string): Promise<User | undefined> {
    const [row] = await this.db.select().from(usersTable).where(eq(usersTable.id, id));
    return row ? toUser(row) : undefined;
  }
}
