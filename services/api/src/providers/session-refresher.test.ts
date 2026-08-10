import { randomBytes } from "node:crypto";

import type { AuthSession, MusicProvider } from "@ekusupo/connector-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ProviderConnectionService } from "./provider-connection-service.js";
import { InMemoryProviderConnectionStore } from "./provider-connection-store.js";
import { sessionWithRefresh } from "./session-refresher.js";

const USER = "user-1";
const NOW = Date.UTC(2026, 0, 1, 12, 0, 0);

const originalKey = process.env.PROVIDER_TOKEN_ENCRYPTION_KEY;

beforeEach(() => {
  process.env.PROVIDER_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("hex");
});

afterEach(() => {
  process.env.PROVIDER_TOKEN_ENCRYPTION_KEY = originalKey;
});

function session(expiresInMs: number | null, token = "old-token"): AuthSession {
  return {
    method: "oauth2",
    raw: { accessToken: token, refreshToken: "refresh-me" },
    ...(expiresInMs === null ? {} : { expiresAt: new Date(NOW + expiresInMs).toISOString() }),
  };
}

function fakeProvider(refresh: MusicProvider["refreshAuthentication"]): MusicProvider {
  return {
    manifest: {
      name: "fake",
      displayName: "Fake",
      version: "0.0.0",
      authenticationMethods: ["oauth2"],
      supportedCapabilities: new Set(["playlists.read"]),
    },
    getCapabilities: () => ({ supports: new Set(["playlists.read"]) }),
    authenticate: async () => session(3600_000),
    refreshAuthentication: refresh,
    revokeAuthentication: async () => {},
  } as unknown as MusicProvider;
}

async function serviceWith(stored?: AuthSession) {
  const service = new ProviderConnectionService(new InMemoryProviderConnectionStore());
  if (stored) await service.saveSession(USER, "fake", stored);
  return service;
}

const deps = (connectionService: ProviderConnectionService) => ({
  connectionService,
  now: () => NOW,
});

describe("sessionWithRefresh", () => {
  it("returns undefined when nothing is connected", async () => {
    const service = await serviceWith();
    const refresh = vi.fn();

    const result = await sessionWithRefresh(USER, "fake", fakeProvider(refresh), deps(service));

    expect(result).toBeUndefined();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("leaves a session with plenty of life alone", async () => {
    const service = await serviceWith(session(3600_000));
    const refresh = vi.fn();

    const result = await sessionWithRefresh(USER, "fake", fakeProvider(refresh), deps(service));

    expect(result?.raw.accessToken).toBe("old-token");
    // Refreshing a healthy token wastes a request every time.
    expect(refresh).not.toHaveBeenCalled();
  });

  it("refreshes a session that has already expired", async () => {
    const service = await serviceWith(session(-60_000));
    const refresh = vi.fn(async () => session(3600_000, "new-token"));

    const result = await sessionWithRefresh(USER, "fake", fakeProvider(refresh), deps(service));

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(result?.raw.accessToken).toBe("new-token");
  });

  it("refreshes one about to expire, rather than waiting for it to fail", async () => {
    // Inside the margin. A background transfer is minutes of work and
    // must not run out of credential halfway through.
    const service = await serviceWith(session(60_000));
    const refresh = vi.fn(async () => session(3600_000, "new-token"));

    const result = await sessionWithRefresh(USER, "fake", fakeProvider(refresh), deps(service));

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(result?.raw.accessToken).toBe("new-token");
  });

  it("stores the refreshed session, so the next call does not refresh again", async () => {
    const service = await serviceWith(session(-60_000));
    const refresh = vi.fn(async () => session(3600_000, "new-token"));
    const provider = fakeProvider(refresh);

    await sessionWithRefresh(USER, "fake", provider, deps(service));
    const second = await sessionWithRefresh(USER, "fake", provider, deps(service));

    // Not persisting would refresh on every request — burning rate limit
    // and, where refresh tokens rotate, eventually breaking the
    // connection outright.
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(second?.raw.accessToken).toBe("new-token");
  });

  it("leaves a session with no expiry alone", async () => {
    // Apple's developer token carries no `expiresAt` through this path;
    // treating "unknown" as "expired" would refresh on every request.
    const service = await serviceWith(session(null));
    const refresh = vi.fn();

    const result = await sessionWithRefresh(USER, "fake", fakeProvider(refresh), deps(service));

    expect(refresh).not.toHaveBeenCalled();
    expect(result?.raw.accessToken).toBe("old-token");
  });

  it("treats an unparseable expiry as expiring rather than as fine", async () => {
    const service = await serviceWith({
      method: "oauth2",
      raw: { accessToken: "old-token", refreshToken: "refresh-me" },
      expiresAt: "not a date",
    });
    const refresh = vi.fn(async () => session(3600_000, "new-token"));

    const result = await sessionWithRefresh(USER, "fake", fakeProvider(refresh), deps(service));

    // One wasted request beats a failed transfer and a confusing error.
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(result?.raw.accessToken).toBe("new-token");
  });

  it("falls back to the stored session when the refresh itself fails", async () => {
    const service = await serviceWith(session(-60_000));
    const refresh = vi.fn(async () => {
      throw new Error("provider said no");
    });

    const result = await sessionWithRefresh(USER, "fake", fakeProvider(refresh), deps(service));

    // The provider gets to reject it and the transfer report explains
    // why, in its own words — better than a vaguer route-level error.
    expect(result?.raw.accessToken).toBe("old-token");
  });
});
