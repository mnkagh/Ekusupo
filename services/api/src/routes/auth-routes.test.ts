import { beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";

import { SESSION_COOKIE_NAME } from "../auth/session-cookie.js";
import { buildServer } from "../server.js";

let app: FastifyInstance;

beforeEach(async () => {
  app = await buildServer();
});

function sessionCookieFrom(response: { cookies: { name: string; value: string }[] }) {
  return response.cookies.find((cookie) => cookie.name === SESSION_COOKIE_NAME)?.value;
}

describe("POST /auth/sign-up", () => {
  it("creates an account, sets a session cookie, and never returns the password hash", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/auth/sign-up",
      payload: { email: "new@example.com", password: "correct horse battery" },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.user.email).toBe("new@example.com");
    expect(body.user.passwordHash).toBeUndefined();
    expect(sessionCookieFrom(response)).toBeDefined();
  });

  it("rejects a request missing a required field before touching the auth service", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/auth/sign-up",
      payload: { email: "new@example.com" },
    });

    expect(response.statusCode).toBe(400);
  });

  it("rejects signing up twice with the same email", async () => {
    const payload = { email: "taken@example.com", password: "correct horse battery" };
    await app.inject({ method: "POST", url: "/auth/sign-up", payload });

    const second = await app.inject({ method: "POST", url: "/auth/sign-up", payload });
    expect(second.statusCode).toBe(400);
  });
});

describe("POST /auth/sign-in", () => {
  it("signs in with correct credentials and sets a session cookie", async () => {
    await app.inject({
      method: "POST",
      url: "/auth/sign-up",
      payload: { email: "user@example.com", password: "correct horse battery" },
    });

    const response = await app.inject({
      method: "POST",
      url: "/auth/sign-in",
      payload: { email: "user@example.com", password: "correct horse battery" },
    });

    expect(response.statusCode).toBe(200);
    expect(sessionCookieFrom(response)).toBeDefined();
  });

  it("rejects an incorrect password with 401", async () => {
    await app.inject({
      method: "POST",
      url: "/auth/sign-up",
      payload: { email: "user@example.com", password: "correct horse battery" },
    });

    const response = await app.inject({
      method: "POST",
      url: "/auth/sign-in",
      payload: { email: "user@example.com", password: "wrong password" },
    });

    expect(response.statusCode).toBe(401);
  });
});

describe("GET /auth/me", () => {
  it("returns the signed-in user when a valid session cookie is sent", async () => {
    const signUp = await app.inject({
      method: "POST",
      url: "/auth/sign-up",
      payload: { email: "user@example.com", password: "correct horse battery" },
    });
    const sessionId = sessionCookieFrom(signUp);

    const response = await app.inject({
      method: "GET",
      url: "/auth/me",
      cookies: { [SESSION_COOKIE_NAME]: sessionId ?? "" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().user.email).toBe("user@example.com");
  });

  it("returns 401 with no session cookie at all", async () => {
    const response = await app.inject({ method: "GET", url: "/auth/me" });
    expect(response.statusCode).toBe(401);
  });

  it("returns 401 for a bogus session cookie", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/auth/me",
      cookies: { [SESSION_COOKIE_NAME]: "not-a-real-session" },
    });
    expect(response.statusCode).toBe(401);
  });
});

describe("POST /auth/sign-out", () => {
  it("invalidates the session — /auth/me fails afterward with the same cookie", async () => {
    const signUp = await app.inject({
      method: "POST",
      url: "/auth/sign-up",
      payload: { email: "user@example.com", password: "correct horse battery" },
    });
    const sessionId = sessionCookieFrom(signUp) ?? "";

    const signOut = await app.inject({
      method: "POST",
      url: "/auth/sign-out",
      cookies: { [SESSION_COOKIE_NAME]: sessionId },
    });
    expect(signOut.statusCode).toBe(200);

    const me = await app.inject({
      method: "GET",
      url: "/auth/me",
      cookies: { [SESSION_COOKIE_NAME]: sessionId },
    });
    expect(me.statusCode).toBe(401);
  });
});
