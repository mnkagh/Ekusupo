import type { AuthSession } from "@ekusupo/connector-sdk";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SessionStore } from "./session-store.js";

const session: AuthSession = {
  method: "oauth2",
  raw: { accessToken: "token", refreshToken: "refresh" },
};

/**
 * A fake `chrome.storage.session`, installed the same way the other
 * extension tests do it. It is a real object outside the store, which is
 * the point: it stands in for the storage area that survives the service
 * worker being torn down.
 */
function installFakeSessionStorage(): { data: Record<string, unknown> } {
  const data: Record<string, unknown> = {};

  (globalThis as { chrome?: unknown }).chrome = {
    storage: {
      session: {
        get: async (key: string) => (key in data ? { [key]: data[key] } : {}),
        set: async (entries: Record<string, unknown>) => Object.assign(data, entries),
        remove: async (key: string) => {
          delete data[key];
        },
      },
    },
  };

  return { data };
}

beforeEach(() => {
  installFakeSessionStorage();
});

afterEach(() => {
  delete (globalThis as { chrome?: unknown }).chrome;
});

describe("SessionStore", () => {
  it("returns undefined for a provider that was never connected", async () => {
    await expect(new SessionStore().get("spotify")).resolves.toBeUndefined();
  });

  it("stores and reads back a session", async () => {
    const store = new SessionStore();
    await store.set("spotify", session);

    await expect(store.get("spotify")).resolves.toEqual(session);
  });

  it("survives the store instance being thrown away", async () => {
    // This is the whole reason it is not a Map. An MV3 service worker is
    // terminated when idle, taking module state with it — a user who
    // connected, waited, then clicked Transfer was told they were not
    // connected and had to authorize again.
    await new SessionStore().set("spotify", session);

    const afterWorkerRestart = new SessionStore();
    await expect(afterWorkerRestart.get("spotify")).resolves.toEqual(session);
  });

  it("keeps providers apart", async () => {
    const store = new SessionStore();
    await store.set("spotify", session);
    await store.set("youtube-music", { ...session, raw: { accessToken: "other" } });

    expect((await store.get("spotify"))?.raw.accessToken).toBe("token");
    expect((await store.get("youtube-music"))?.raw.accessToken).toBe("other");
  });

  it("clears one provider without touching the others", async () => {
    const store = new SessionStore();
    await store.set("spotify", session);
    await store.set("youtube-music", session);

    await store.clear("spotify");

    await expect(store.get("spotify")).resolves.toBeUndefined();
    await expect(store.get("youtube-music")).resolves.toEqual(session);
  });

  it("uses the session storage area, never local", async () => {
    // `storage.local` writes to disk, which would leave access and
    // refresh tokens in plaintext on the filesystem. The fake here only
    // implements `session`, so reaching for `local` throws rather than
    // silently succeeding.
    const { data } = installFakeSessionStorage();
    await new SessionStore().set("spotify", session);

    expect(Object.keys(data)).toEqual(["provider-session:spotify"]);
  });
});
