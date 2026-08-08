import { describe, expect, it } from "vitest";

import { InMemoryProviderConnectionStore } from "./provider-connection-store.js";
import type { ProviderConnection } from "./provider-connection.js";

function makeConnection(overrides: Partial<ProviderConnection> = {}): ProviderConnection {
  return {
    id: "connection-1",
    userId: "user-1",
    provider: "spotify",
    encryptedTokens: "iv:tag:ciphertext",
    connectedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("InMemoryProviderConnectionStore", () => {
  it("finds a connection by user and provider", async () => {
    const store = new InMemoryProviderConnectionStore();
    await store.upsert(makeConnection());

    await expect(store.findByUserAndProvider("user-1", "spotify")).resolves.toMatchObject({
      id: "connection-1",
    });
  });

  it("upsert replaces an existing connection for the same user+provider", async () => {
    const store = new InMemoryProviderConnectionStore();
    await store.upsert(makeConnection({ encryptedTokens: "first" }));
    await store.upsert(makeConnection({ id: "connection-2", encryptedTokens: "second" }));

    const connection = await store.findByUserAndProvider("user-1", "spotify");
    expect(connection?.id).toBe("connection-2");
    expect(connection?.encryptedTokens).toBe("second");
  });

  it("keeps different providers for the same user independent", async () => {
    const store = new InMemoryProviderConnectionStore();
    await store.upsert(makeConnection({ provider: "spotify" }));
    await store.upsert(makeConnection({ id: "connection-2", provider: "other" }));

    await expect(store.listByUser("user-1")).resolves.toHaveLength(2);
  });

  it("keeps different users' connections independent", async () => {
    const store = new InMemoryProviderConnectionStore();
    await store.upsert(makeConnection({ userId: "user-1" }));
    await store.upsert(makeConnection({ id: "connection-2", userId: "user-2" }));

    await expect(store.listByUser("user-1")).resolves.toHaveLength(1);
  });

  it("removes a connection on delete", async () => {
    const store = new InMemoryProviderConnectionStore();
    await store.upsert(makeConnection());
    await store.delete("user-1", "spotify");

    await expect(store.findByUserAndProvider("user-1", "spotify")).resolves.toBeUndefined();
  });
});
