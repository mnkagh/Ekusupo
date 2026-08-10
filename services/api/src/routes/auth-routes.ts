import type { FastifyInstance } from "fastify";

import { AuthError, AuthService } from "../auth/auth-service.js";
import { createAuthRateLimits, enforceRateLimit, rateLimitKey } from "../auth/rate-limit-guard.js";
import type { AuthRateLimits } from "../auth/rate-limit-guard.js";
import { SESSION_COOKIE_NAME, requireAuth, setSessionCookie } from "../auth/session-cookie.js";
import type { SessionStore } from "../auth/session-store.js";
import type { UserStore } from "../auth/user-store.js";
import { toPublicUser } from "../auth/user.js";

export interface AuthRoutesDeps {
  userStore: UserStore;
  sessionStore: SessionStore;
  /** Shared with the account routes, so one budget covers every password check. */
  rateLimits?: AuthRateLimits;
}

interface CredentialsBody {
  Body: { email: string; password: string };
}

const credentialsSchema = {
  body: {
    type: "object",
    required: ["email", "password"],
    properties: {
      email: { type: "string" },
      password: { type: "string" },
    },
  },
};

/** AuthError is a user-facing 400; anything else is a real server error and should propagate. */
function isAuthError(error: unknown): error is AuthError {
  return error instanceof AuthError;
}

/**
 * A plain function, not a Fastify plugin (`fastify-plugin`) — this repo
 * doesn't need encapsulation boundaries between route groups yet, and
 * `authService` is constructed once here rather than per-request. See
 * ADR-0022.
 */
export function registerAuthRoutes(
  app: FastifyInstance,
  deps: AuthRoutesDeps,
): { authService: AuthService; rateLimits: AuthRateLimits } {
  const authService = new AuthService(deps);
  const rateLimits = deps.rateLimits ?? createAuthRateLimits();

  app.post<CredentialsBody>(
    "/auth/sign-up",
    { schema: credentialsSchema },
    async (request, reply) => {
      if (!enforceRateLimit(request, reply, rateLimits.signUp, "sign-up")) return;

      try {
        const { user, sessionId, expiresAt } = await authService.signUp(
          request.body.email,
          request.body.password,
        );
        setSessionCookie(reply, sessionId, expiresAt);
        reply.code(201);
        return { user: toPublicUser(user) };
      } catch (error) {
        if (!isAuthError(error)) throw error;
        reply.code(400);
        return { error: error.message };
      }
    },
  );

  app.post<CredentialsBody>(
    "/auth/sign-in",
    { schema: credentialsSchema },
    async (request, reply) => {
      if (!enforceRateLimit(request, reply, rateLimits.signIn, "sign-in")) return;

      try {
        const { user, sessionId, expiresAt } = await authService.signIn(
          request.body.email,
          request.body.password,
        );
        setSessionCookie(reply, sessionId, expiresAt);
        // A correct password proves this was not credential guessing, so
        // earlier typos should not count against the person who made them.
        rateLimits.signIn.reset(rateLimitKey(request, "sign-in"));
        return { user: toPublicUser(user) };
      } catch (error) {
        if (!isAuthError(error)) throw error;
        reply.code(401);
        return { error: error.message };
      }
    },
  );

  app.post("/auth/sign-out", async (request, reply) => {
    const sessionId = request.cookies[SESSION_COOKIE_NAME];
    if (sessionId) await authService.signOut(sessionId);
    reply.clearCookie(SESSION_COOKIE_NAME, { path: "/" });
    return { signedOut: true };
  });

  app.get("/auth/me", async (request, reply) => {
    const user = await requireAuth(request, reply, authService);
    if (!user) return;
    return { user: toPublicUser(user) };
  });

  return { authService, rateLimits };
}
