import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getTabTransferState, setTabTransferState } from "./tab-transfer-status-store.js";

/**
 * A minimal hand-rolled fake of chrome.storage.session — same style as
 * shared/message-bus.test.ts's fake chrome.runtime.
 */
function installFakeChromeStorage() {
  const data = new Map<string, unknown>();
  (globalThis as { chrome?: unknown }).chrome = {
    storage: {
      session: {
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

describe("tab transfer status store", () => {
  it("returns idle for a tab that's never had a transfer", async () => {
    await expect(getTabTransferState(1)).resolves.toEqual({ kind: "idle" });
  });

  it("round-trips a set state back through get", async () => {
    await setTabTransferState(7, { kind: "failed", reason: "not connected" });

    await expect(getTabTransferState(7)).resolves.toEqual({
      kind: "failed",
      reason: "not connected",
    });
  });

  it("keeps different tabs' state independent", async () => {
    await setTabTransferState(1, { kind: "running", step: "matching" });
    await setTabTransferState(2, { kind: "idle" });

    await expect(getTabTransferState(1)).resolves.toEqual({ kind: "running", step: "matching" });
    await expect(getTabTransferState(2)).resolves.toEqual({ kind: "idle" });
  });
});
