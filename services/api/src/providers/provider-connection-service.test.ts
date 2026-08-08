import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { InMemoryProviderConnectionStore } from "./provider-connection-store.js";
import { ProviderConnectionService } from "./provider-connection-service.js";

const originalKey = process.env.PROVIDER_TOKEN_ENCRYPTION_KEY;

beforeEach(() => {
  process.env.PROVIDER_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("hex");
});

afterEach(() => {
  process.env.PROVIDER_TOKEN_ENCRYPTION_KEY = originalKey;
});

describe("ProviderConnectionService", () => {
  it("round-trips a saved session back through getSession, decrypted", async () => {
    const service = new ProviderConnectionService(new InMemoryProviderConnectionStore());
    const session = { method: "oauth2" as const, raw: { accessToken: "abc123" } };

    await service.saveSession("user-1", "spotify", session);

    await expect(service.getSession("user-1", "spotify")).resolves.toEqual(session);
  });

  it("never stores the session in plain text in the underlying store", async () => {
    const store = new InMemoryProviderConnectionStore();
    const service = new ProviderConnectionService(store);

    await service.saveSession("user-1", "spotify", {
      method: "oauth2",
      raw: { accessToken: "super-secret-token" },
    });

    const raw = await store.findByUserAndProvider("user-1", "spotify");
    expect(raw?.encryptedTokens).not.toContain("super-secret-token");
  });

  it("getSession resolves to undefined when nothing is connected", async () => {
    const service = new ProviderConnectionService(new InMemoryProviderConnectionStore());
    await expect(service.getSession("user-1", "spotify")).resolves.toBeUndefined();
  });

  it("listConnections never includes tokens, only provider + connectedAt", async () => {
    const service = new ProviderConnectionService(new InMemoryProviderConnectionStore());
    await service.saveSession("user-1", "spotify", { method: "oauth2", raw: { accessToken: "x" } });

    const connections = await service.listConnections("user-1");
    expect(connections).toEqual([{ provider: "spotify", connectedAt: expect.any(String) }]);
  });

  it("disconnect removes the connection", async () => {
    const service = new ProviderConnectionService(new InMemoryProviderConnectionStore());
    await service.saveSession("user-1", "spotify", { method: "oauth2", raw: {} });
    await service.disconnect("user-1", "spotify");

    await expect(service.getSession("user-1", "spotify")).resolves.toBeUndefined();
  });
});
