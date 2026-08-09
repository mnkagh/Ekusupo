import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";

import { corsOriginsFor } from "./cors-origins.js";
import { PostgresSessionStore } from "./auth/postgres-session-store.js";
import { PostgresUserStore } from "./auth/postgres-user-store.js";
import type { SessionStore } from "./auth/session-store.js";
import type { UserStore } from "./auth/user-store.js";
import { ensureSchema } from "./db/bootstrap.js";
import { createDb } from "./db/client.js";
import type { Database } from "./db/client.js";
import { PostgresProviderConnectionStore } from "./providers/postgres-provider-connection-store.js";
import type { ProviderConnectionStore } from "./providers/provider-connection-store.js";
import type { ProviderCredentials } from "./providers/provider-registry.js";
import type { ConnectRoutesDeps } from "./routes/connect-routes.js";
import { registerAuthRoutes } from "./routes/auth-routes.js";
import type { ProviderRoutesConfig, ProviderRoutesDeps } from "./routes/provider-routes.js";
import { registerConnectRoutes } from "./routes/connect-routes.js";
import { registerProviderRoutes } from "./routes/provider-routes.js";
import { registerTransferRoutes } from "./routes/transfer-routes.js";
import type { TransferRoutesDeps } from "./routes/transfer-routes.js";

export interface BuildServerOptions {
  /** One origin, or several — see `corsOriginsFor`. */
  corsOrigin?: string | string[];
  userStore?: UserStore;
  sessionStore?: SessionStore;
  providerConnectionStore?: ProviderConnectionStore;
  providerRoutesConfig?: ProviderRoutesConfig;
  createSpotifyProviderImpl?: ProviderRoutesDeps["createSpotifyProviderImpl"];
  /**
   * Backs every store below, not just `transfer_jobs` (ADR-0027).
   * Defaults to a fresh in-memory `pglite` instance — real Postgres,
   * just ephemeral, so tests that pass no `db` still get real SQL.
   */
  db?: Database;
  createTransferSpotifyProviderImpl?: TransferRoutesDeps["createSpotifyProviderImpl"];
  createSpotifyAppSessionImpl?: TransferRoutesDeps["createSpotifyAppSessionImpl"];
  /** Per-provider credentials, keyed by provider id — see provider-registry.ts. */
  providerCredentials?: Record<string, ProviderCredentials>;
  /** Test seam: replaces parts of a provider definition without a live network call. */
  providerOverrides?: ConnectRoutesDeps["overrides"];
}

/**
 * A factory, not a module-level singleton — tests build their own
 * instance and use `.inject()` rather than binding a real port, the
 * same "no live network involved" testing style used throughout this
 * repo (packages/providers/spotify's fetchImpl injection, etc.). Stores
 * default to in-memory (ADR-0022) but are overridable, the same
 * injection pattern used everywhere else in this codebase.
 */
export async function buildServer(options: BuildServerOptions = {}): Promise<FastifyInstance> {
  const app = Fastify();

  await app.register(cookie);
  await app.register(cors, {
    origin: options.corsOrigin ?? corsOriginsFor("http://localhost:5173"),
    credentials: true,
  });

  app.get("/health", async () => ({ status: "ok" }));

  // One `db` backs every default store, so they all share one storage
  // world. This matters: `transfer_jobs.user_id` and
  // `provider_connections.user_id` are real foreign keys to `users.id`
  // (schema.ts), so a user held only in a `Map` while jobs are written
  // to Postgres would violate them on insert. The in-memory stores
  // ADR-0022 introduced predate this `db` existing and remain available
  // by injection, but are no longer the default.
  const db = options.db ?? createDb();
  await ensureSchema(db);

  const authService = registerAuthRoutes(app, {
    userStore: options.userStore ?? new PostgresUserStore(db),
    sessionStore: options.sessionStore ?? new PostgresSessionStore(db),
  });

  const providerConnectionStore =
    options.providerConnectionStore ?? new PostgresProviderConnectionStore(db);

  registerProviderRoutes(app, {
    authService,
    providerConnectionStore,
    config: options.providerRoutesConfig,
    createSpotifyProviderImpl: options.createSpotifyProviderImpl,
  });

  // Registry-driven connect/disconnect for every provider. Registered
  // before the Spotify-specific routes so the generic
  // /providers/:provider/connect handles anything the registry knows.
  registerConnectRoutes(app, {
    authService,
    providerConnectionStore,
    credentials: options.providerCredentials ?? {
      spotify: {
        clientId: options.providerRoutesConfig?.spotifyClientId,
        clientSecret: options.providerRoutesConfig?.spotifyClientSecret,
        redirectUri: options.providerRoutesConfig?.spotifyRedirectUri,
      },
    },
    webAppUrl: options.providerRoutesConfig?.webAppUrl ?? "http://localhost:5173",
    overrides: options.providerOverrides,
  });

  registerTransferRoutes(app, {
    authService,
    providerConnectionStore,
    db,
    createSpotifyProviderImpl: options.createTransferSpotifyProviderImpl,
    // Same credentials the OAuth routes use — they also authorize the
    // app-level token that reads public playlists with nobody connected.
    spotifyClientId: options.providerRoutesConfig?.spotifyClientId,
    spotifyClientSecret: options.providerRoutesConfig?.spotifyClientSecret,
    createSpotifyAppSessionImpl: options.createSpotifyAppSessionImpl,
  });

  return app;
}
