import { randomBytes } from "node:crypto";

import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";

import { createAuthRateLimits } from "../auth/rate-limit-guard.js";
import { RateLimiter } from "../auth/rate-limiter.js";
import { buildServer } from "../server.js";

const PASSWORD = "correct horse battery";

/** Tight limits so a test proves the guard without making six real requests. */
function tightLimits() {
  return createAuthRateLimits({
    signIn: new RateLimiter({ limit: 2, windowMs: 60_000 }),
    signUp: new RateLimiter({ limit: 2, windowMs: 60_000 }),
    sensitive: new RateLimiter({ limit: 2, windowMs: 60_000 }),
  });
}

/**
 * Every test here needs its own counters, so each builds its own
 * server — and each of those opens its own embedded Postgres. Tracking
 * them means teardown frees them even when a test fails part-way, which
 * a `close()` at the end of the test body would skip. See server.test.ts.
 */
let openServers: FastifyInstance[] = [];

async function buildThrottledServer(): Promise<FastifyInstance> {
  const app = await buildServer({ authRateLimits: tightLimits() });
  openServers.push(app);
  return app;
}

afterEach(async () => {
  await Promise.all(openServers.map((app) => app.close()));
  openServers = [];
});

function newEmail(): string {
  return `user-${randomBytes(4).toString("hex")}@example.com`;
}

async function signUp(app: FastifyInstance, email = newEmail()) {
  const response = await app.inject({
    method: "POST",
    url: "/auth/sign-up",
    payload: { email, password: PASSWORD },
  });
  return {
    email,
    response,
    cookie: response.cookies.find((c) => c.name === "ekusupo_session")?.value ?? "",
  };
}

describe("credential-guessing limits", () => {
  it("stops repeated wrong-password sign-ins with a 429 and a Retry-After", async () => {
    const app = await buildThrottledServer();
    const { email } = await signUp(app);

    const attempt = () =>
      app.inject({
        method: "POST",
        url: "/auth/sign-in",
        payload: { email, password: "wrong" },
      });

    expect((await attempt()).statusCode).toBe(401);
    expect((await attempt()).statusCode).toBe(401);

    const blocked = await attempt();
    expect(blocked.statusCode).toBe(429);
    expect(Number(blocked.headers["retry-after"])).toBeGreaterThan(0);
    expect(blocked.json().error).toMatch(/Too many attempts/);
  });

  it("refuses the correct password too, once the budget is spent", async () => {
    const app = await buildThrottledServer();
    const { email } = await signUp(app);

    for (let i = 0; i < 2; i += 1) {
      await app.inject({
        method: "POST",
        url: "/auth/sign-in",
        payload: { email, password: "no" },
      });
    }

    // The limiter cannot know a request is legitimate before checking it,
    // and checking is the expensive thing being rationed.
    const correct = await app.inject({
      method: "POST",
      url: "/auth/sign-in",
      payload: { email, password: PASSWORD },
    });
    expect(correct.statusCode).toBe(429);
  });

  it("a successful sign-in clears the budget, so typos are not cumulative", async () => {
    const app = await buildThrottledServer();
    const { email } = await signUp(app);

    const wrong = await app.inject({
      method: "POST",
      url: "/auth/sign-in",
      payload: { email, password: "typo" },
    });
    expect(wrong.statusCode).toBe(401);

    const right = await app.inject({
      method: "POST",
      url: "/auth/sign-in",
      payload: { email, password: PASSWORD },
    });
    expect(right.statusCode).toBe(200);

    // Budget was reset by the success, so two more attempts are available.
    for (let i = 0; i < 2; i += 1) {
      const retry = await app.inject({
        method: "POST",
        url: "/auth/sign-in",
        payload: { email, password: "typo" },
      });
      expect(retry.statusCode).toBe(401);
    }
  });

  it("throttles mass account creation", async () => {
    const app = await buildThrottledServer();

    expect((await signUp(app)).response.statusCode).toBe(201);
    expect((await signUp(app)).response.statusCode).toBe(201);
    expect((await signUp(app)).response.statusCode).toBe(429);
  });

  it("keeps separate budgets per route, so signing up does not lock out signing in", async () => {
    const app = await buildThrottledServer();
    const { email } = await signUp(app);
    await signUp(app);
    // Sign-up budget is now spent.
    expect((await signUp(app)).response.statusCode).toBe(429);

    const signIn = await app.inject({
      method: "POST",
      url: "/auth/sign-in",
      payload: { email, password: PASSWORD },
    });
    expect(signIn.statusCode).toBe(200);
  });

  it("throttles password changes, which are also a password check", async () => {
    const app = await buildThrottledServer();
    const { cookie } = await signUp(app);

    const attempt = () =>
      app.inject({
        method: "POST",
        url: "/account/password",
        payload: { currentPassword: "guess", newPassword: "a whole new thing" },
        cookies: { ekusupo_session: cookie },
      });

    expect((await attempt()).statusCode).toBe(400);
    expect((await attempt()).statusCode).toBe(400);
    expect((await attempt()).statusCode).toBe(429);
  });

  it("shares one budget between password change and account deletion", async () => {
    const app = await buildThrottledServer();
    const { cookie } = await signUp(app);

    // Spending it here...
    for (let i = 0; i < 2; i += 1) {
      await app.inject({
        method: "POST",
        url: "/account/password",
        payload: { currentPassword: "guess", newPassword: "a whole new thing" },
        cookies: { ekusupo_session: cookie },
      });
    }

    // ...must leave nothing for the other password check, or the limit
    // is sidestepped by alternating between the two endpoints.
    const deletion = await app.inject({
      method: "DELETE",
      url: "/account",
      payload: { password: "guess", confirm: "DELETE" },
      cookies: { ekusupo_session: cookie },
    });
    expect(deletion.statusCode).toBe(429);
  });

  it("does not throttle reads", async () => {
    const app = await buildThrottledServer();
    const { cookie } = await signUp(app);

    for (let i = 0; i < 6; i += 1) {
      const response = await app.inject({
        method: "GET",
        url: "/auth/me",
        cookies: { ekusupo_session: cookie },
      });
      expect(response.statusCode).toBe(200);
    }
  });
});
