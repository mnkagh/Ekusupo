import { beforeEach, describe, expect, it } from "vitest";

import { ensureSchema } from "../db/bootstrap.js";
import { createDb } from "../db/client.js";
import type { Database } from "../db/client.js";
import { PostgresUserStore } from "./postgres-user-store.js";
import type { User } from "./user.js";

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    email: "user@example.com",
    passwordHash: "salt:hash",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

let db: Database;
let store: PostgresUserStore;

beforeEach(async () => {
  // In-memory pglite — a real, fresh Postgres instance per test, not a
  // shared/mocked one. See ADR-0024.
  db = createDb();
  await ensureSchema(db);
  store = new PostgresUserStore(db);
});

describe("PostgresUserStore", () => {
  it("finds a created user by id, via real SQL", async () => {
    await store.create(makeUser());
    await expect(store.findById("11111111-1111-1111-1111-111111111111")).resolves.toMatchObject({
      email: "user@example.com",
    });
  });

  it("finds a created user by email, case-insensitively", async () => {
    await store.create(makeUser({ email: "User@Example.com" }));
    await expect(store.findByEmail("user@example.com")).resolves.toMatchObject({
      id: "11111111-1111-1111-1111-111111111111",
    });
  });

  it("returns undefined for an id or email that doesn't exist", async () => {
    await expect(store.findById("22222222-2222-2222-2222-222222222222")).resolves.toBeUndefined();
    await expect(store.findByEmail("missing@example.com")).resolves.toBeUndefined();
  });

  it("enforces a unique email at the database level", async () => {
    await store.create(makeUser());
    await expect(
      store.create(makeUser({ id: "33333333-3333-3333-3333-333333333333" })),
    ).rejects.toThrow();
  });

  it("survives being read by a second store instance against the same database", async () => {
    await store.create(makeUser());

    const secondStore = new PostgresUserStore(db);
    await expect(
      secondStore.findById("11111111-1111-1111-1111-111111111111"),
    ).resolves.toMatchObject({ email: "user@example.com" });
  });
});
