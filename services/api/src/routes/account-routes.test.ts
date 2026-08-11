import { randomBytes } from "node:crypto";

import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildServer } from "../server.js";

let app: FastifyInstance;
const originalKey = process.env.PROVIDER_TOKEN_ENCRYPTION_KEY;

const PASSWORD = "correct horse battery";

interface Account {
  email: string;
  cookie: string;
}

async function signUp(): Promise<Account> {
  const email = `user-${randomBytes(4).toString("hex")}@example.com`;
  const response = await app.inject({
    method: "POST",
    url: "/auth/sign-up",
    payload: { email, password: PASSWORD },
  });
  return {
    email,
    cookie: response.cookies.find((c) => c.name === "ekusupo_session")?.value ?? "",
  };
}

beforeEach(() => {
  process.env.PROVIDER_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("hex");
});

afterEach(async () => {
  process.env.PROVIDER_TOKEN_ENCRYPTION_KEY = originalKey;
  // Frees the embedded Postgres the server opened for itself. Each one
  // is a whole WASM heap, and leaving them open across a suite run is
  // what made pglite setup time out at random — see server.test.ts.
  await app?.close();
});

describe("POST /account/password", () => {
  it("requires authentication", async () => {
    app = await buildServer();
    const response = await app.inject({
      method: "POST",
      url: "/account/password",
      payload: { currentPassword: PASSWORD, newPassword: "a whole new thing" },
    });
    expect(response.statusCode).toBe(401);
  });

  it("changes the password and lets the user sign in with the new one", async () => {
    app = await buildServer();
    const account = await signUp();

    const change = await app.inject({
      method: "POST",
      url: "/account/password",
      payload: { currentPassword: PASSWORD, newPassword: "a whole new thing" },
      cookies: { ekusupo_session: account.cookie },
    });
    expect(change.statusCode).toBe(200);
    expect(change.json()).toEqual({ changed: true });

    const withNew = await app.inject({
      method: "POST",
      url: "/auth/sign-in",
      payload: { email: account.email, password: "a whole new thing" },
    });
    expect(withNew.statusCode).toBe(200);

    const withOld = await app.inject({
      method: "POST",
      url: "/auth/sign-in",
      payload: { email: account.email, password: PASSWORD },
    });
    expect(withOld.statusCode).toBe(401);
  });

  it("refuses without the current password, even though the caller is signed in", async () => {
    app = await buildServer();
    const account = await signUp();

    const response = await app.inject({
      method: "POST",
      url: "/account/password",
      payload: { currentPassword: "not it", newPassword: "a whole new thing" },
      cookies: { ekusupo_session: account.cookie },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toMatch(/not your current password/);
  });

  it("rejects a new password that is too short, or unchanged", async () => {
    app = await buildServer();
    const account = await signUp();

    const short = await app.inject({
      method: "POST",
      url: "/account/password",
      payload: { currentPassword: PASSWORD, newPassword: "short" },
      cookies: { ekusupo_session: account.cookie },
    });
    expect(short.statusCode).toBe(400);
    expect(short.json().error).toMatch(/at least 8 characters/);

    const same = await app.inject({
      method: "POST",
      url: "/account/password",
      payload: { currentPassword: PASSWORD, newPassword: PASSWORD },
      cookies: { ekusupo_session: account.cookie },
    });
    expect(same.statusCode).toBe(400);
    expect(same.json().error).toMatch(/must be different/);
  });

  it("signs out other devices but not the one making the change", async () => {
    app = await buildServer();
    const account = await signUp();

    // A second session for the same account — the "other device".
    const second = await app.inject({
      method: "POST",
      url: "/auth/sign-in",
      payload: { email: account.email, password: PASSWORD },
    });
    const secondCookie = second.cookies.find((c) => c.name === "ekusupo_session")?.value ?? "";

    const change = await app.inject({
      method: "POST",
      url: "/account/password",
      payload: { currentPassword: PASSWORD, newPassword: "a whole new thing" },
      cookies: { ekusupo_session: account.cookie },
    });
    const refreshedCookie = change.cookies.find((c) => c.name === "ekusupo_session")?.value ?? "";

    // The old session is gone: whoever knew the old password must not
    // keep a live session after it is changed.
    const otherDevice = await app.inject({
      method: "GET",
      url: "/auth/me",
      cookies: { ekusupo_session: secondCookie },
    });
    expect(otherDevice.statusCode).toBe(401);

    // The person who made the change is still signed in, via the cookie
    // the response set.
    expect(refreshedCookie).not.toBe(account.cookie);
    const stillHere = await app.inject({
      method: "GET",
      url: "/auth/me",
      cookies: { ekusupo_session: refreshedCookie },
    });
    expect(stillHere.statusCode).toBe(200);
  });
});

describe("GET /account/export", () => {
  it("requires authentication", async () => {
    app = await buildServer();
    expect((await app.inject({ method: "GET", url: "/account/export" })).statusCode).toBe(401);
  });

  it("returns the caller's own data as a downloadable file", async () => {
    app = await buildServer();
    const account = await signUp();

    const response = await app.inject({
      method: "GET",
      url: "/account/export",
      cookies: { ekusupo_session: account.cookie },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-disposition"]).toContain("ekusupo-account-export.json");

    const body = response.json();
    expect(body.account.email).toBe(account.email);
    expect(body.transfers).toEqual([]);
    expect(body.connectedProviders).toEqual([]);
  });

  it("never includes a password hash or a provider token", async () => {
    app = await buildServer();
    const account = await signUp();

    const response = await app.inject({
      method: "GET",
      url: "/account/export",
      cookies: { ekusupo_session: account.cookie },
    });

    // Asserted against the whole serialized body rather than a field, so
    // a future field carrying either one fails this too.
    const raw = response.body;
    expect(raw).not.toContain("passwordHash");
    expect(raw).not.toContain("encryptedTokens");
    expect(raw).not.toContain("accessToken");
    expect(response.json().note).toMatch(/access tokens are deliberately excluded/i);
  });
});

describe("DELETE /account", () => {
  it("requires authentication", async () => {
    app = await buildServer();
    const response = await app.inject({
      method: "DELETE",
      url: "/account",
      payload: { password: PASSWORD, confirm: "DELETE" },
    });
    expect(response.statusCode).toBe(401);
  });

  it("refuses without both the password and the literal confirmation", async () => {
    app = await buildServer();
    const account = await signUp();

    const unconfirmed = await app.inject({
      method: "DELETE",
      url: "/account",
      payload: { password: PASSWORD },
      cookies: { ekusupo_session: account.cookie },
    });
    expect(unconfirmed.statusCode).toBe(400);

    const wrongWord = await app.inject({
      method: "DELETE",
      url: "/account",
      payload: { password: PASSWORD, confirm: "delete" },
      cookies: { ekusupo_session: account.cookie },
    });
    expect(wrongWord.statusCode).toBe(400);

    const wrongPassword = await app.inject({
      method: "DELETE",
      url: "/account",
      payload: { password: "not it", confirm: "DELETE" },
      cookies: { ekusupo_session: account.cookie },
    });
    expect(wrongPassword.statusCode).toBe(400);
    expect(wrongPassword.json().error).toMatch(/not your password/);

    // Still there, after three refused attempts.
    const me = await app.inject({
      method: "GET",
      url: "/auth/me",
      cookies: { ekusupo_session: account.cookie },
    });
    expect(me.statusCode).toBe(200);
  });

  it("really deletes the account, its sessions, and everything cascading from it", async () => {
    app = await buildServer();
    const account = await signUp();

    const response = await app.inject({
      method: "DELETE",
      url: "/account",
      payload: { password: PASSWORD, confirm: "DELETE" },
      cookies: { ekusupo_session: account.cookie },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ deleted: true });

    // The session no longer resolves to anyone.
    const me = await app.inject({
      method: "GET",
      url: "/auth/me",
      cookies: { ekusupo_session: account.cookie },
    });
    expect(me.statusCode).toBe(401);

    // And the credentials no longer work.
    const signIn = await app.inject({
      method: "POST",
      url: "/auth/sign-in",
      payload: { email: account.email, password: PASSWORD },
    });
    expect(signIn.statusCode).toBe(401);

    // The email is free again, which is the observable proof the row is
    // gone rather than merely hidden.
    const reuse = await app.inject({
      method: "POST",
      url: "/auth/sign-up",
      payload: { email: account.email, password: PASSWORD },
    });
    expect(reuse.statusCode).toBe(201);
  });
});
