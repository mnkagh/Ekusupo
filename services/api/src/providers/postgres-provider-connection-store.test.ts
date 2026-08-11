import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { PostgresUserStore } from "../auth/postgres-user-store.js";
import { createTestDatabase } from "../db/test-database.js";
import type { Database } from "../db/client.js";
import { usersTable } from "../db/schema.js";
import { PostgresProviderConnectionStore } from "./postgres-provider-connection-store.js";
import type { ProviderConnection } from "./provider-connection.js";

const USER_ID = "11111111-1111-1111-1111-111111111111";

function makeConnection(overrides: Partial<ProviderConnection> = {}): ProviderConnection {
  return {
    id: "22222222-2222-2222-2222-222222222222",
    userId: USER_ID,
    provider: "spotify",
    encryptedTokens: "iv:tag:ciphertext",
    connectedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

let db: Database;
let closeDb: () => Promise<void>;
let store: PostgresProviderConnectionStore;

afterEach(async () => {
  await closeDb();
});

beforeEach(async () => {
  ({ db, close: closeDb } = await createTestDatabase());
  await new PostgresUserStore(db).create({
    id: USER_ID,
    email: "user@example.com",
    passwordHash: "salt:hash",
    createdAt: "2026-01-01T00:00:00.000Z",
  });
  store = new PostgresProviderConnectionStore(db);
});

describe("PostgresProviderConnectionStore", () => {
  it("finds a connection by user and provider, via real SQL", async () => {
    await store.upsert(makeConnection());
    await expect(store.findByUserAndProvider(USER_ID, "spotify")).resolves.toMatchObject({
      encryptedTokens: "iv:tag:ciphertext",
    });
  });

  it("upsert replaces the row for the same user+provider (real ON CONFLICT)", async () => {
    await store.upsert(makeConnection({ encryptedTokens: "first" }));
    await store.upsert(
      makeConnection({ id: "33333333-3333-3333-3333-333333333333", encryptedTokens: "second" }),
    );

    const connections = await store.listByUser(USER_ID);
    expect(connections).toHaveLength(1);
    expect(connections[0]?.encryptedTokens).toBe("second");
  });

  it("cascades: deleting the user deletes their provider connections", async () => {
    await store.upsert(makeConnection());
    await db.delete(usersTable);

    await expect(store.findByUserAndProvider(USER_ID, "spotify")).resolves.toBeUndefined();
  });

  it("removes a connection on delete without touching others", async () => {
    await store.upsert(makeConnection({ provider: "spotify" }));
    await store.upsert(
      makeConnection({ id: "33333333-3333-3333-3333-333333333333", provider: "other" }),
    );

    await store.delete(USER_ID, "spotify");

    const connections = await store.listByUser(USER_ID);
    expect(connections).toHaveLength(1);
    expect(connections[0]?.provider).toBe("other");
  });
});
