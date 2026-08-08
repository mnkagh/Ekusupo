import { beforeEach, describe, expect, it } from "vitest";

import { AuthError, AuthService } from "./auth-service.js";
import { InMemorySessionStore } from "./session-store.js";
import { InMemoryUserStore } from "./user-store.js";

let userStore: InMemoryUserStore;
let sessionStore: InMemorySessionStore;
let authService: AuthService;

beforeEach(() => {
  userStore = new InMemoryUserStore();
  sessionStore = new InMemorySessionStore();
  authService = new AuthService({ userStore, sessionStore });
});

describe("signUp", () => {
  it("creates a user, hashes the password, and returns a live session", async () => {
    const result = await authService.signUp("new@example.com", "correct horse battery");

    expect(result.user.email).toBe("new@example.com");
    expect(result.user.passwordHash).not.toContain("correct horse battery");
    expect(result.sessionId).toBeDefined();

    const stored = await userStore.findByEmail("new@example.com");
    expect(stored?.id).toBe(result.user.id);
  });

  it("rejects a duplicate email", async () => {
    await authService.signUp("taken@example.com", "correct horse battery");
    await expect(authService.signUp("taken@example.com", "another password")).rejects.toThrow(
      AuthError,
    );
  });

  it("rejects an invalid email", async () => {
    await expect(authService.signUp("not-an-email", "correct horse battery")).rejects.toThrow(
      AuthError,
    );
  });

  it("rejects a too-short password", async () => {
    await expect(authService.signUp("new@example.com", "short")).rejects.toThrow(AuthError);
  });
});

describe("signIn", () => {
  it("signs in with the correct password and returns a new session", async () => {
    await authService.signUp("user@example.com", "correct horse battery");

    const result = await authService.signIn("user@example.com", "correct horse battery");
    expect(result.user.email).toBe("user@example.com");
  });

  it("rejects an incorrect password without revealing which part was wrong", async () => {
    await authService.signUp("user@example.com", "correct horse battery");

    await expect(authService.signIn("user@example.com", "wrong password")).rejects.toThrow(
      "Incorrect email or password.",
    );
  });

  it("rejects a nonexistent email with the same message as a wrong password", async () => {
    await expect(authService.signIn("nobody@example.com", "correct horse battery")).rejects.toThrow(
      "Incorrect email or password.",
    );
  });
});

describe("getUserForSession / signOut", () => {
  it("resolves the user for a valid session", async () => {
    const { sessionId, user } = await authService.signUp(
      "user@example.com",
      "correct horse battery",
    );

    const resolved = await authService.getUserForSession(sessionId);
    expect(resolved?.id).toBe(user.id);
  });

  it("returns undefined for an unknown session", async () => {
    await expect(authService.getUserForSession("bogus")).resolves.toBeUndefined();
  });

  it("returns undefined and cleans up an expired session", async () => {
    const { sessionId } = await authService.signUp("user@example.com", "correct horse battery");
    await sessionStore.create({
      id: sessionId,
      userId: "whoever",
      createdAt: new Date(Date.now() - 1000).toISOString(),
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });

    await expect(authService.getUserForSession(sessionId)).resolves.toBeUndefined();
    await expect(sessionStore.get(sessionId)).resolves.toBeUndefined();
  });

  it("invalidates the session on sign out", async () => {
    const { sessionId } = await authService.signUp("user@example.com", "correct horse battery");
    await authService.signOut(sessionId);

    await expect(authService.getUserForSession(sessionId)).resolves.toBeUndefined();
  });
});
