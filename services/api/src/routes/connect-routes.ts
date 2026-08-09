import { randomBytes } from "node:crypto";

import type { FastifyInstance } from "fastify";

import type { AuthService } from "../auth/auth-service.js";
import { requireAuth } from "../auth/session-cookie.js";
import { ProviderConnectionService } from "../providers/provider-connection-service.js";
import type { ProviderConnectionStore } from "../providers/provider-connection-store.js";
import { findProvider, PROVIDER_DEFINITIONS } from "../providers/provider-registry.js";
import type { ProviderCredentials, ProviderDefinition } from "../providers/provider-registry.js";

const OAUTH_STATE_COOKIE = "ekusupo_oauth_state";

export interface ConnectRoutesDeps {
  authService: AuthService;
  providerConnectionStore: ProviderConnectionStore;
  /** Credentials per provider id, from the environment. */
  credentials: Record<string, ProviderCredentials>;
  webAppUrl: string;
  /** Injectable so tests can exercise the full flow without a live network call. */
  overrides?: Record<string, Partial<ProviderDefinition>>;
}

/**
 * Connect and disconnect for every provider in the registry, driven by
 * that registry rather than by a route per service.
 *
 * The Spotify-specific routes this replaces had the CSRF check, the
 * error mapping and the redirect handling written inline; a second
 * provider would have meant copying all three, and the copies would have
 * drifted. Everything provider-specific now lives in the registry, and
 * everything security-relevant lives here, once.
 */
export function registerConnectRoutes(app: FastifyInstance, deps: ConnectRoutesDeps): void {
  const { authService, providerConnectionStore, credentials, webAppUrl } = deps;
  const connectionService = new ProviderConnectionService(providerConnectionStore);

  function definitionFor(id: string): ProviderDefinition | undefined {
    const base = findProvider(id);
    if (!base) return undefined;
    const override = deps.overrides?.[id];
    return override ? { ...base, ...override } : base;
  }

  /** What the dashboard needs to render the provider list without hardcoding it. */
  app.get("/providers/catalog", async () => ({
    providers: PROVIDER_DEFINITIONS.map((definition) => ({
      id: definition.id,
      displayName: definition.displayName,
      authKind: definition.authKind,
      configured: definition.isConfigured(credentials[definition.id] ?? {}),
      requiredEnv: definition.requiredEnv,
    })),
  }));

  app.get<{ Params: { provider: string } }>(
    "/providers/:provider/connect",
    async (request, reply) => {
      const user = await requireAuth(request, reply, authService);
      if (!user) return;

      const definition = definitionFor(request.params.provider);
      if (!definition) {
        reply.code(404);
        return { error: `Unknown provider "${request.params.provider}".` };
      }

      const creds = credentials[definition.id] ?? {};
      if (!definition.isConfigured(creds)) {
        reply.code(400);
        return {
          error: `${definition.displayName} isn't configured on this server (${definition.requiredEnv.join(", ")} missing).`,
        };
      }

      // No redirect for a server-token provider: there is no user
      // account to authorize, so the connection is established here.
      if (definition.authKind === "serverToken") {
        const session = await definition.buildServerSession!(creds);
        try {
          await connectionService.saveSession(user.id, definition.id, session);
        } catch (error) {
          console.error(
            `[Ekusupo API] Could not store the ${definition.displayName} connection — check PROVIDER_TOKEN_ENCRYPTION_KEY`,
            error,
          );
          return reply.redirect(`${webAppUrl}/?provider_error=storage_failed`);
        }
        return reply.redirect(`${webAppUrl}/?connected=${definition.id}`);
      }

      // Double-submit-cookie CSRF check, verified on the callback. An
      // attacker could otherwise link their own provider account to a
      // victim's Ekusupo session by luring them to a crafted callback
      // URL; the session cookie alone does not prevent that.
      const state = randomBytes(16).toString("hex");
      reply.setCookie(OAUTH_STATE_COOKIE, state, {
        path: `/providers/${definition.id}/callback`,
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 600,
      });

      return reply.redirect(definition.buildAuthorizeUrl!(creds, state));
    },
  );

  app.get<{
    Params: { provider: string };
    Querystring: { code?: string; state?: string; error?: string };
  }>("/providers/:provider/callback", async (request, reply) => {
    const user = await requireAuth(request, reply, authService);
    if (!user) return;

    const definition = definitionFor(request.params.provider);
    if (!definition || definition.authKind !== "oauth2") {
      reply.code(404);
      return { error: `Unknown provider "${request.params.provider}".` };
    }

    const expectedState = request.cookies[OAUTH_STATE_COOKIE];
    reply.clearCookie(OAUTH_STATE_COOKIE, { path: `/providers/${definition.id}/callback` });

    if (request.query.error) {
      return reply.redirect(
        `${webAppUrl}/?provider_error=${encodeURIComponent(request.query.error)}`,
      );
    }
    if (!request.query.code || !request.query.state || request.query.state !== expectedState) {
      reply.code(400);
      return { error: "Invalid or expired OAuth state." };
    }

    const creds = credentials[definition.id] ?? {};
    if (!definition.isConfigured(creds)) {
      reply.code(400);
      return { error: `${definition.displayName} isn't configured on this server.` };
    }

    // Exchange and storage are caught separately: a failed exchange means
    // the credentials or redirect URI are wrong, while failed storage
    // means the server is misconfigured. Reporting both the same way
    // sends the operator to re-check credentials that were never at fault.
    let session;
    try {
      session = await definition.exchangeCode!(creds, request.query.code);
    } catch (error) {
      console.warn(`[Ekusupo API] ${definition.displayName} token exchange failed`, error);
      return reply.redirect(`${webAppUrl}/?provider_error=exchange_failed`);
    }

    try {
      await connectionService.saveSession(user.id, definition.id, session);
    } catch (error) {
      console.error(
        `[Ekusupo API] ${definition.displayName} authorized but the connection could not be stored — check PROVIDER_TOKEN_ENCRYPTION_KEY`,
        error,
      );
      return reply.redirect(`${webAppUrl}/?provider_error=storage_failed`);
    }

    return reply.redirect(`${webAppUrl}/?connected=${definition.id}`);
  });
}
