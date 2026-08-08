import { describe, expect, it } from "vitest";

import { InMemorySessionStore } from "./session-store.js";
import type { Session } from "./session.js";

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: "session-1",
    userId: "user-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    expiresAt: "2026-01-08T00:00:00.000Z",
    ...overrides,
  };
}

describe("InMemorySessionStore", () => {
  it("finds a created session by id", async () => {
    const store = new InMemorySessionStore();
    await store.create(makeSession());

    await expect(store.get("session-1")).resolves.toMatchObject({ userId: "user-1" });
  });

  it("returns undefined for a session id that doesn't exist", async () => {
    const store = new InMemorySessionStore();
    await expect(store.get("missing")).resolves.toBeUndefined();
  });

  it("removes a session on delete", async () => {
    const store = new InMemorySessionStore();
    await store.create(makeSession());
    await store.delete("session-1");

    await expect(store.get("session-1")).resolves.toBeUndefined();
  });
});
