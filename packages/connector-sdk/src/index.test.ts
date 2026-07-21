import { describe, expect, it } from "vitest";

import { ConnectorError } from "./error.js";
import type { MusicProvider } from "./index.js";

/**
 * A minimal fake provider implementing only the required auth methods plus
 * `listPlaylists` — every other capability-gated method is deliberately
 * omitted, proving `MusicProvider` doesn't force connectors to implement
 * operations they don't support.
 */
const fakeProvider: MusicProvider = {
  id: "fake-provider",
  displayName: "Fake Provider",

  getCapabilities: () => ({
    supports: new Set(["playlists.read"]),
    limits: { requestsPerSecond: 10 },
  }),

  authenticate: async () => ({ method: "apiKey", raw: { token: "fake-token" } }),
  refreshAuthentication: async (session) => session,
  revokeAuthentication: async () => {},

  listPlaylists: async () => ({ items: [], nextCursor: undefined }),
};

describe("MusicProvider", () => {
  it("allows capability-gated methods to be omitted entirely", () => {
    expect(fakeProvider.listPlaylists).toBeTypeOf("function");
    expect(fakeProvider.createPlaylist).toBeUndefined();
    expect(fakeProvider.searchTracks).toBeUndefined();
  });

  it("round-trips getCapabilities()", () => {
    const capabilities = fakeProvider.getCapabilities();
    expect(capabilities.supports.has("playlists.read")).toBe(true);
    expect(capabilities.supports.has("playlists.create")).toBe(false);
    expect(capabilities.limits?.requestsPerSecond).toBe(10);
  });

  it("supports the full auth lifecycle", async () => {
    const session = await fakeProvider.authenticate({ method: "apiKey", raw: { apiKey: "x" } });
    expect(session.method).toBe("apiKey");

    const refreshed = await fakeProvider.refreshAuthentication(session);
    expect(refreshed).toBe(session);

    await expect(fakeProvider.revokeAuthentication(session)).resolves.toBeUndefined();
  });
});

describe("ConnectorError", () => {
  it("carries its code and defaults retryable based on the code", () => {
    const rateLimited = new ConnectorError("rate_limited", "Too many requests", {
      retryAfterMs: 5000,
    });
    expect(rateLimited.code).toBe("rate_limited");
    expect(rateLimited.retryable).toBe(true);
    expect(rateLimited.retryAfterMs).toBe(5000);

    const validation = new ConnectorError("validation_error", "Missing title");
    expect(validation.retryable).toBe(false);
    expect(validation).toBeInstanceOf(Error);
  });
});
