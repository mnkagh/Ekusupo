import type { FastifyReply, FastifyRequest } from "fastify";

import { RateLimiter } from "./rate-limiter.js";

/**
 * Credential-guessing limits, per client address.
 *
 * **Keyed by address, deliberately not by email.** Counting failures per
 * account would let anyone lock a victim out of their own account by
 * guessing at it — trading a brute-force risk for a denial-of-service
 * one. The address is the thing an attacker has to spend to change.
 *
 * The numbers are chosen to be invisible to a person who mistyped their
 * password twice and ruinous to a script: five sign-in attempts per
 * fifteen minutes is roughly 480 guesses a day from one address, against
 * a keyspace an 8-character minimum makes astronomically larger.
 */
const FIFTEEN_MINUTES = 15 * 60 * 1000;

export interface AuthRateLimits {
  signIn: RateLimiter;
  signUp: RateLimiter;
  /** Password change and account deletion both re-check a password. */
  sensitive: RateLimiter;
}

export function createAuthRateLimits(overrides: Partial<AuthRateLimits> = {}): AuthRateLimits {
  return {
    signIn: overrides.signIn ?? new RateLimiter({ limit: 5, windowMs: FIFTEEN_MINUTES }),
    // Looser than sign-in: a shared address (an office, a campus) can
    // legitimately produce several new accounts, and a wrong guess here
    // costs an attacker nothing to begin with.
    signUp: overrides.signUp ?? new RateLimiter({ limit: 10, windowMs: FIFTEEN_MINUTES }),
    sensitive: overrides.sensitive ?? new RateLimiter({ limit: 10, windowMs: FIFTEEN_MINUTES }),
  };
}

/**
 * `request.ip` respects Fastify's `trustProxy` setting, which is off by
 * default — so behind a reverse proxy this is the proxy's address until
 * `trustProxy` is configured, and every client shares one budget. That is
 * the safe direction to be wrong in (over-limiting, not under-limiting),
 * and it is called out in `services/api/.env.example`.
 */
export function enforceRateLimit(
  request: FastifyRequest,
  reply: FastifyReply,
  limiter: RateLimiter,
  scope: string,
): boolean {
  return applyLimit(reply, limiter, `${scope}:${request.ip}`, {
    error: "Too many attempts. Wait a few minutes and try again.",
  });
}

/**
 * Keyed by **user**, not address — the opposite choice from the
 * credential limits above, and for the opposite reason. Those guard
 * routes anyone can reach, where counting per account would let a
 * stranger lock someone out. This guards routes that already required a
 * session, so the key can only be spent by the account's own holder;
 * there is no lockout to hand anyone. Keying these by address instead
 * would make one office or campus share a single budget.
 */
export function enforceUserRateLimit(
  reply: FastifyReply,
  limiter: RateLimiter,
  scope: string,
  userId: string,
  message: string,
): boolean {
  return applyLimit(reply, limiter, `${scope}:${userId}`, { error: message });
}

function applyLimit(
  reply: FastifyReply,
  limiter: RateLimiter,
  key: string,
  body: { error: string },
): boolean {
  const decision = limiter.check(key);
  if (decision.allowed) return true;

  reply.header("Retry-After", String(decision.retryAfterSeconds));
  reply.code(429);
  reply.send({ ...body, retryAfterSeconds: decision.retryAfterSeconds });
  return false;
}

export function rateLimitKey(request: FastifyRequest, scope: string): string {
  return `${scope}:${request.ip}`;
}
