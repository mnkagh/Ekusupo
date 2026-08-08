import { describe, expect, it } from "vitest";

import { InMemoryUserStore } from "./user-store.js";
import type { User } from "./user.js";

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: "user-1",
    email: "user@example.com",
    passwordHash: "salt:hash",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("InMemoryUserStore", () => {
  it("finds a created user by id", async () => {
    const store = new InMemoryUserStore();
    await store.create(makeUser());

    await expect(store.findById("user-1")).resolves.toMatchObject({ email: "user@example.com" });
  });

  it("finds a created user by email, case-insensitively", async () => {
    const store = new InMemoryUserStore();
    await store.create(makeUser({ email: "User@Example.com" }));

    await expect(store.findByEmail("user@example.com")).resolves.toMatchObject({
      id: "user-1",
    });
  });

  it("returns undefined for an id or email that doesn't exist", async () => {
    const store = new InMemoryUserStore();

    await expect(store.findById("missing")).resolves.toBeUndefined();
    await expect(store.findByEmail("missing@example.com")).resolves.toBeUndefined();
  });
});
