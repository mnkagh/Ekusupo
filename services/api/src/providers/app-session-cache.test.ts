import type { AuthSession } from "@ekusupo/connector-sdk";
import { describe, expect, it, vi } from "vitest";

import { AppSessionCache } from "./app-session-cache.js";

function session(expiresInMs: number, token = "token"): AuthSession {
  return {
    method: "oauth2",
    raw: { accessToken: token, appOnly: true },
    expiresAt: new Date(Date.now() + expiresInMs).toISOString(),
  };
}

describe("AppSessionCache", () => {
  it("fetches once and reuses the token while it is still valid", async () => {
    const fetchSession = vi.fn().mockResolvedValue(session(3_600_000));
    const cache = new AppSessionCache(fetchSession);

    await cache.get();
    await cache.get();
    await cache.get();

    expect(fetchSession).toHaveBeenCalledTimes(1);
  });

  it("fetches a new token once the old one is close to expiring", async () => {
    const fetchSession = vi
      .fn()
      .mockResolvedValueOnce(session(30_000, "nearly-expired"))
      .mockResolvedValueOnce(session(3_600_000, "fresh"));
    const cache = new AppSessionCache(fetchSession);

    await cache.get();
    const second = await cache.get();

    expect(fetchSession).toHaveBeenCalledTimes(2);
    expect(second.raw.accessToken).toBe("fresh");
  });

  it("shares one in-flight request across concurrent callers", async () => {
    let resolve: ((value: AuthSession) => void) | undefined;
    const fetchSession = vi.fn().mockReturnValue(
      new Promise<AuthSession>((r) => {
        resolve = r;
      }),
    );
    const cache = new AppSessionCache(fetchSession);

    const all = Promise.all([cache.get(), cache.get(), cache.get()]);
    resolve?.(session(3_600_000));
    await all;

    // Without sharing, a cold cache under load would exchange three times.
    expect(fetchSession).toHaveBeenCalledTimes(1);
  });

  it("recovers after a failure instead of wedging on the rejected promise", async () => {
    const fetchSession = vi
      .fn()
      .mockRejectedValueOnce(new Error("spotify unreachable"))
      .mockResolvedValueOnce(session(3_600_000, "recovered"));
    const cache = new AppSessionCache(fetchSession);

    await expect(cache.get()).rejects.toThrow("spotify unreachable");
    await expect(cache.get()).resolves.toMatchObject({ raw: { accessToken: "recovered" } });
  });

  it("treats a session with no expiry as valid indefinitely", async () => {
    const fetchSession = vi.fn().mockResolvedValue({ method: "oauth2", raw: {} } as AuthSession);
    const cache = new AppSessionCache(fetchSession);

    await cache.get();
    await cache.get();

    expect(fetchSession).toHaveBeenCalledTimes(1);
  });
});
