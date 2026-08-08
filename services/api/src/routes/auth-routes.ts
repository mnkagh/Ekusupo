import type { FastifyInstance, FastifyReply } from "fastify";

import { AuthError, AuthService } from "../auth/auth-service.js";
import type { SessionStore } from "../auth/session-store.js";
import type { UserStore } from "../auth/user-store.js";
import { toPublicUser } from "../auth/user.js";

export const SESSION_COOKIE_NAME = "ekusupo_session";

export interface AuthRoutesDeps {
  userStore: UserStore;
  sessionStore: SessionStore;
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

function setSessionCookie(reply: FastifyReply, sessionId: string, expiresAt: string): void {
  reply.setCookie(SESSION_COOKIE_NAME, sessionId, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    // Plain HTTP in local dev; a real deployment is always HTTPS. See ADR-0022.
    secure: process.env.NODE_ENV === "production",
    expires: new Date(expiresAt),
  });
}

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
export function registerAuthRoutes(app: FastifyInstance, deps: AuthRoutesDeps): void {
  const authService = new AuthService(deps);

  app.post<CredentialsBody>(
    "/auth/sign-up",
    { schema: credentialsSchema },
    async (request, reply) => {
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
      try {
        const { user, sessionId, expiresAt } = await authService.signIn(
          request.body.email,
          request.body.password,
        );
        setSessionCookie(reply, sessionId, expiresAt);
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
    const sessionId = request.cookies[SESSION_COOKIE_NAME];
    const user = sessionId ? await authService.getUserForSession(sessionId) : undefined;

    if (!user) {
      reply.code(401);
      return { error: "not_authenticated" };
    }
    return { user: toPublicUser(user) };
  });
}
