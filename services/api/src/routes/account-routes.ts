import type { FastifyInstance } from "fastify";

import { AuthError } from "../auth/auth-service.js";
import type { AuthService } from "../auth/auth-service.js";
import { createAuthRateLimits, enforceRateLimit } from "../auth/rate-limit-guard.js";
import type { AuthRateLimits } from "../auth/rate-limit-guard.js";
import { SESSION_COOKIE_NAME, requireAuth, setSessionCookie } from "../auth/session-cookie.js";
import { toPublicUser } from "../auth/user.js";
import type { Database } from "../db/client.js";
import { ProviderConnectionService } from "../providers/provider-connection-service.js";
import type { ProviderConnectionStore } from "../providers/provider-connection-store.js";
import { PostgresTransferJobStore } from "../transfers/postgres-transfer-job-store.js";

export interface AccountRoutesDeps {
  authService: AuthService;
  providerConnectionStore: ProviderConnectionStore;
  db: Database;
  rateLimits?: AuthRateLimits;
}

const changePasswordSchema = {
  body: {
    type: "object",
    required: ["currentPassword", "newPassword"],
    properties: {
      currentPassword: { type: "string" },
      newPassword: { type: "string" },
    },
  },
};

/**
 * Deleting an account is irreversible, so the request has to say so in
 * two ways: the password, and a literal confirmation. Neither alone is
 * enough — a password proves who is asking, `confirm` proves they meant
 * to (CLAUDE.md §9.3).
 */
const deleteAccountSchema = {
  body: {
    type: "object",
    required: ["password", "confirm"],
    properties: {
      password: { type: "string" },
      confirm: { const: "DELETE" },
    },
  },
};

function isAuthError(error: unknown): error is AuthError {
  return error instanceof AuthError;
}

/**
 * One scope for both routes, deliberately. Changing a password and
 * deleting an account each verify the same password, so separate budgets
 * would let a guesser alternate between the two endpoints for twice the
 * attempts — the limit has to follow the secret being guessed, not the
 * URL it was guessed at.
 */
const PASSWORD_CHECK_SCOPE = "password-check";

/**
 * Account settings — CLAUDE.md §8.2's last MVP screen, and the concrete
 * form of §21.2's user-control promise: change your password, take your
 * data with you, and leave entirely.
 */
export function registerAccountRoutes(app: FastifyInstance, deps: AccountRoutesDeps): void {
  const { authService, providerConnectionStore, db } = deps;
  const connectionService = new ProviderConnectionService(providerConnectionStore);
  const rateLimits = deps.rateLimits ?? createAuthRateLimits();

  app.post<{ Body: { currentPassword: string; newPassword: string } }>(
    "/account/password",
    { schema: changePasswordSchema },
    async (request, reply) => {
      const user = await requireAuth(request, reply, authService);
      if (!user) return;
      // Also a password check, so also a guessing target — an unattended
      // session is exactly the situation the current-password check
      // defends against.
      if (!enforceRateLimit(request, reply, rateLimits.sensitive, PASSWORD_CHECK_SCOPE)) return;

      try {
        const { sessionId, expiresAt } = await authService.changePassword(
          user.id,
          request.body.currentPassword,
          request.body.newPassword,
        );
        // A new cookie, because the change invalidated every session
        // including the one this request arrived on.
        setSessionCookie(reply, sessionId, expiresAt);
        return { changed: true };
      } catch (error) {
        if (!isAuthError(error)) throw error;
        reply.code(400);
        return { error: error.message };
      }
    },
  );

  /**
   * Everything Ekusupo holds about the caller, as one file
   * (CLAUDE.md §3.8, §21.2). Deliberately *not* included: provider access
   * and refresh tokens. They are encrypted at rest precisely so they are
   * never handed back out (§12.1, §21.3); a data export that decrypted
   * them would undo that in a single request, and they are Ekusupo's
   * credentials to hold rather than the user's data to keep. Which
   * providers are connected, and since when, is included.
   */
  app.get("/account/export", async (request, reply) => {
    const user = await requireAuth(request, reply, authService);
    if (!user) return;

    const jobStore = new PostgresTransferJobStore(db, user.id);
    const transfers = await jobStore.listForUser();

    const upfExports = await Promise.all(
      transfers
        .filter((job) => job.hasUpfDocument)
        .map(async (job) => ({
          transferId: job.id,
          document: await jobStore.findUpfDocument(job.id),
        })),
    );

    reply.header("Content-Type", "application/json; charset=utf-8");
    reply.header("Content-Disposition", `attachment; filename="ekusupo-account-export.json"`);

    return {
      exportedAt: new Date().toISOString(),
      account: toPublicUser(user),
      connectedProviders: await connectionService.listConnections(user.id),
      transfers,
      upfExports,
      note: "Provider access tokens are deliberately excluded — they are stored encrypted and are never returned. Disconnect a provider to revoke them.",
    };
  });

  app.delete<{ Body: { password: string; confirm: "DELETE" } }>(
    "/account",
    { schema: deleteAccountSchema },
    async (request, reply) => {
      const user = await requireAuth(request, reply, authService);
      if (!user) return;
      if (!enforceRateLimit(request, reply, rateLimits.sensitive, PASSWORD_CHECK_SCOPE)) return;

      try {
        await authService.deleteAccount(user.id, request.body.password);
      } catch (error) {
        if (!isAuthError(error)) throw error;
        reply.code(400);
        return { error: error.message };
      }

      reply.clearCookie(SESSION_COOKIE_NAME, { path: "/" });
      return { deleted: true };
    },
  );
}
