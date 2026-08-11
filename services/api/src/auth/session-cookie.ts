import type { FastifyReply, FastifyRequest } from "fastify";

import type { AuthService } from "./auth-service.js";
import type { User } from "./user.js";

export const SESSION_COOKIE_NAME = "ekusupo_session";

export function setSessionCookie(reply: FastifyReply, sessionId: string, expiresAt: string): void {
  reply.setCookie(SESSION_COOKIE_NAME, sessionId, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    // Plain HTTP in local dev; a real deployment is always HTTPS. See ADR-0022.
    secure: process.env.NODE_ENV === "production",
    expires: new Date(expiresAt),
  });
}

/**
 * Shared by every route group that needs to know who's asking — pulled
 * out once `routes/provider-routes.ts` needed the exact same "read the
 * session cookie, resolve a user, 401 if there isn't one" logic
 * `routes/auth-routes.ts`'s `/auth/me` already had. Sends the 401 itself
 * (rather than just returning `undefined`) so every caller gets the same
 * response shape without repeating it.
 */
export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply,
  authService: AuthService,
): Promise<User | undefined> {
  const user = await optionalAuth(request, authService);

  if (!user) {
    reply.code(401);
    reply.send({ error: "not_authenticated" });
    return undefined;
  }
  return user;
}

/**
 * Who is asking, if anyone — without turning "nobody" into an error.
 *
 * For routes that are public but answer *better* when they know the
 * caller. The provider catalogue is the case that needed it: it is
 * readable signed out, but a signed-in user's own OAuth credentials
 * change whether a provider counts as configured for them.
 */
export async function optionalAuth(
  request: FastifyRequest,
  authService: AuthService,
): Promise<User | undefined> {
  const sessionId = request.cookies[SESSION_COOKIE_NAME];
  return sessionId ? await authService.getUserForSession(sessionId) : undefined;
}
