import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getSpotifyClientId, setSpotifyClientId } from "./client-id-store.js";

/** Same hand-rolled-fake style as background/tab-transfer-status-store.test.ts. */
function installFakeChromeStorage() {
  const data = new Map<string, unknown>();
  (globalThis as { chrome?: unknown }).chrome = {
    storage: {
      local: {
        get: async (key: string) => ({ [key]: data.get(key) }),
        set: async (items: Record<string, unknown>) => {
          for (const [key, value] of Object.entries(items)) data.set(key, value);
        },
      },
    },
  };
}

beforeEach(() => {
  installFakeChromeStorage();
});

afterEach(() => {
  delete (globalThis as { chrome?: unknown }).chrome;
});

describe("client id store", () => {
  it("returns undefined when nothing has been saved yet", async () => {
    await expect(getSpotifyClientId()).resolves.toBeUndefined();
  });

  it("round-trips a saved client id", async () => {
    await setSpotifyClientId("my-client-id");
    await expect(getSpotifyClientId()).resolves.toBe("my-client-id");
  });
});
