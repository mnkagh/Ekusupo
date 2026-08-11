import { randomBytes } from "node:crypto";

import type { FastifyInstance } from "fastify";

import type { AuthService } from "../auth/auth-service.js";
import { optionalAuth, requireAuth } from "../auth/session-cookie.js";
import type { Database } from "../db/client.js";
import { resolveCredentials } from "../providers/credential-resolver.js";
import { PostgresProviderCredentialStore } from "../providers/provider-credential-store.js";
import { ProviderConnectionService } from "../providers/provider-connection-service.js";
import type { ProviderConnectionStore } from "../providers/provider-connection-store.js";
import { findProvider, PROVIDER_DEFINITIONS } from "../providers/provider-registry.js";
import type { ProviderCredentials, ProviderDefinition } from "../providers/provider-registry.js";

const OAUTH_STATE_COOKIE = "ekusupo_oauth_state";

export interface ConnectRoutesDeps {
  authService: AuthService;
  providerConnectionStore: ProviderConnectionStore;
  /** The deployment's own credentials per provider id, from the environment. */
  credentials: Record<string, ProviderCredentials>;
  /** Backs each user's own stored credentials. */
  db: Database;
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

  /** The user's own app if they registered one, else the deployment's. */
  async function credentialsFor(userId: string, providerId: string) {
    return resolveCredentials(userId, providerId, {
      db: deps.db,
      serverCredentials: credentials,
    });
  }

  /**
   * What the dashboard needs to render the provider list.
   *
   * `configured` is answered for *this user*, not for the deployment: a
   * provider the server has no credentials for is still usable by
   * someone who brought their own, and showing it as unavailable to them
   * would be a lie about their own account.
   */
  app.get("/providers/catalog", async (request) => {
    const user = await optionalAuth(request, authService);
    const entries = await Promise.all(
      PROVIDER_DEFINITIONS.map(async (definition) => {
        const resolved = user
          ? await credentialsFor(user.id, definition.id)
          : { credentials: credentials[definition.id] ?? {}, source: "server" as const };
        return {
          id: definition.id,
          displayName: definition.displayName,
          authKind: definition.authKind,
          configured: definition.isConfigured(resolved.credentials),
          /** Lets the UI say "using your own app" rather than only "connected". */
          credentialSource: definition.isConfigured(resolved.credentials)
            ? resolved.source
            : "none",
          requiredEnv: definition.requiredEnv,
        };
      }),
    );
    return { providers: entries };
  });

  /**
   * The caller's own stored app credentials — summaries only. There is
   * no endpoint that returns a client secret back out, deliberately: it
   * goes in and is used, and the only way to change it is to replace it.
   */
  app.get("/providers/credentials", async (request, reply) => {
    const user = await requireAuth(request, reply, authService);
    if (!user) return;

    const store = new PostgresProviderCredentialStore(deps.db, user.id);
    return { credentials: await store.list() };
  });

  const credentialsBodySchema = {
    body: {
      type: "object",
      additionalProperties: false,
      properties: {
        clientId: { type: "string", minLength: 1, maxLength: 512 },
        clientSecret: { type: "string", minLength: 1, maxLength: 512 },
        redirectUri: { type: "string", minLength: 1, maxLength: 2048 },
        developerToken: { type: "string", minLength: 1, maxLength: 4096 },
      },
    },
  } as const;

  interface CredentialsBody {
    clientId?: string;
    clientSecret?: string;
    redirectUri?: string;
    developerToken?: string;
  }

  app.put<{ Params: { provider: string }; Body: CredentialsBody }>(
    "/providers/:provider/credentials",
    { schema: credentialsBodySchema },
    async (request, reply) => {
      const user = await requireAuth(request, reply, authService);
      if (!user) return;

      const definition = definitionFor(request.params.provider);
      if (!definition) {
        reply.code(404);
        return { error: `Unknown provider "${request.params.provider}".` };
      }

      const submitted: ProviderCredentials = {
        ...(request.body.clientId ? { clientId: request.body.clientId } : {}),
        ...(request.body.clientSecret ? { clientSecret: request.body.clientSecret } : {}),
        ...(request.body.redirectUri ? { redirectUri: request.body.redirectUri } : {}),
        ...(request.body.developerToken ? { developerToken: request.body.developerToken } : {}),
      };

      // Checked against the provider's own rule rather than a generic
      // "not empty": saving a half-filled set would fail later, at the
      // redirect, with an error from the provider instead of from here.
      if (!definition.isConfigured(submitted)) {
        reply.code(400);
        return {
          error: `Not enough to use ${definition.displayName}. It needs ${definition.requiredEnv.join(", ")}.`,
        };
      }

      await new PostgresProviderCredentialStore(deps.db, user.id).save(definition.id, submitted);

      // Any existing connection was authorized by a different app, so its
      // tokens are no longer valid for these credentials.
      await connectionService.disconnect(user.id, definition.id);

      return { saved: true, reconnectRequired: true };
    },
  );

  app.delete<{ Params: { provider: string } }>(
    "/providers/:provider/credentials",
    async (request, reply) => {
      const user = await requireAuth(request, reply, authService);
      if (!user) return;

      const removed = await new PostgresProviderCredentialStore(deps.db, user.id).delete(
        request.params.provider,
      );
      if (!removed) {
        reply.code(404);
        return { error: "No stored credentials for that provider." };
      }

      // Same reasoning as saving: the tokens belonged to the app that is
      // being removed.
      await connectionService.disconnect(user.id, request.params.provider);
      return { deleted: true };
    },
  );

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

      const { credentials: creds } = await credentialsFor(user.id, definition.id);
      if (!definition.isConfigured(creds)) {
        reply.code(400);
        return {
          error: `${definition.displayName} isn't set up yet. Add your own ${definition.displayName} app on the Providers panel, or ask the operator to configure ${definition.requiredEnv.join(", ")}.`,
        };
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
