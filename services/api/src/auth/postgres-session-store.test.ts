import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTestDatabase } from "../db/test-database.js";
import type { Database } from "../db/client.js";
import { PostgresUserStore } from "./postgres-user-store.js";
import { PostgresSessionStore } from "./postgres-session-store.js";
import type { Session } from "./session.js";

const USER_ID = "11111111-1111-1111-1111-111111111111";

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: "session-1",
    userId: USER_ID,
    createdAt: "2026-01-01T00:00:00.000Z",
    expiresAt: "2026-01-08T00:00:00.000Z",
    ...overrides,
  };
}

let db: Database;
let closeDb: () => Promise<void>;
let store: PostgresSessionStore;

afterEach(async () => {
  await closeDb();
});

beforeEach(async () => {
  ({ db, close: closeDb } = await createTestDatabase());
  // Sessions reference users via a foreign key — a real row has to
  // exist first, the same constraint a real deployment would enforce.
  await new PostgresUserStore(db).create({
    id: USER_ID,
    email: "user@example.com",
    passwordHash: "salt:hash",
    createdAt: "2026-01-01T00:00:00.000Z",
  });
  store = new PostgresSessionStore(db);
});

describe("PostgresSessionStore", () => {
  it("finds a created session by id, via real SQL", async () => {
    await store.create(makeSession());
    await expect(store.get("session-1")).resolves.toMatchObject({ userId: USER_ID });
  });

  it("returns undefined for a session id that doesn't exist", async () => {
    await expect(store.get("missing")).resolves.toBeUndefined();
  });

  it("removes a session on delete", async () => {
    await store.create(makeSession());
    await store.delete("session-1");
    await expect(store.get("session-1")).resolves.toBeUndefined();
  });

  it("rejects a session referencing a user that doesn't exist (real foreign key)", async () => {
    await expect(
      store.create(makeSession({ userId: "99999999-9999-9999-9999-999999999999" })),
    ).rejects.toThrow();
  });

  it("cascades: deleting the user deletes their sessions", async () => {
    await store.create(makeSession());
    await db.execute(sql`DELETE FROM users WHERE id = ${USER_ID}`);

    await expect(store.get("session-1")).resolves.toBeUndefined();
  });
});
