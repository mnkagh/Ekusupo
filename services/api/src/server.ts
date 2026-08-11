import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";

import { corsOriginsFor } from "./cors-origins.js";
import { PostgresSessionStore } from "./auth/postgres-session-store.js";
import { PostgresUserStore } from "./auth/postgres-user-store.js";
import type { AuthRateLimits } from "./auth/rate-limit-guard.js";
import type { RateLimiter } from "./auth/rate-limiter.js";
import type { SessionStore } from "./auth/session-store.js";
import type { UserStore } from "./auth/user-store.js";
import { ensureSchema, failInterruptedJobs } from "./db/bootstrap.js";
import { createDbFromClient, createPgliteClient } from "./db/client.js";
import type { Database } from "./db/client.js";
import { PostgresProviderConnectionStore } from "./providers/postgres-provider-connection-store.js";
import type { ProviderConnectionStore } from "./providers/provider-connection-store.js";
import type { ProviderCredentials } from "./providers/provider-registry.js";
import type { ConnectRoutesDeps } from "./routes/connect-routes.js";
import { registerAccountRoutes } from "./routes/account-routes.js";
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
  /**
   * Credential-guessing limits. Injectable so a test can set a limit of
   * one instead of making six real requests, and so every test that
   * builds a server gets its own counters rather than sharing a module
   * singleton that leaks state between files.
   */
  authRateLimits?: AuthRateLimits;
  /**
   * How many transfers one account may start per window. Same reason as
   * `authRateLimits`: a test sets a limit of one rather than starting
   * thirty real jobs, and each server gets its own counters.
   */
  transferStartLimiter?: RateLimiter;
  /** See the constructor comment; defaults to `TRUST_PROXY === "true"`. */
  trustProxy?: boolean;
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
  // Off unless explicitly enabled. Sign-in throttling keys on
  // `request.ip`, which follows X-Forwarded-For only when this is on —
  // and that header is trivially forged by anyone talking to the server
  // directly. Wrong-off over-limits a shared address; wrong-on is a hole.
  const app = Fastify({ trustProxy: options.trustProxy ?? process.env.TRUST_PROXY === "true" });

  // Fastify's built-in JSON parser rejects an empty body outright
  // (FST_ERR_CTP_EMPTY_JSON_BODY, a 400). Browser clients routinely set
  // `Content-Type: application/json` on every request from one shared
  // `fetch` wrapper, including the POSTs that carry no body at all — so
  // `/auth/sign-out` answered 400 and nobody could sign out of the
  // dashboard, while every `.inject()` test passed because `inject`
  // sends no content-type unless given a payload. Treat an empty body
  // as `{}` and let each route's schema decide whether that is
  // acceptable; malformed JSON is still a 400.
  app.addContentTypeParser(
    "application/json",
    { parseAs: "string" },
    (_request, body: string, done) => {
      if (body.trim() === "") {
        done(null, {});
        return;
      }
      try {
        done(null, JSON.parse(body));
      } catch {
        const failure = new Error("Body is not valid JSON.") as Error & { statusCode?: number };
        failure.statusCode = 400;
        done(failure, undefined);
      }
    },
  );

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
  //
  // Whoever creates the instance closes it. A caller that passes `db`
  // keeps ownership (index.ts holds one for the process lifetime); a
  // caller that passes nothing gets one created here, and then it is
  // this server's job to free it on `close()`. Without that, every
  // `buildServer()` in a test file stranded a whole WASM Postgres heap
  // that lived until the worker exited — ~120 of them across a suite
  // run, which is what made the pglite setup time out at random.
  let db: Database;
  if (options.db) {
    db = options.db;
  } else {
    const ownedClient = createPgliteClient();
    db = createDbFromClient(ownedClient);
    app.addHook("onClose", () => ownedClient.close());
  }
  await ensureSchema(db);

  // Transfers run in this process (ADR-0033), so anything left `running`
  // belongs to a process that no longer exists. Resolving those before
  // serving a single request means no client ever polls a job that
  // nothing is working on.
  const interrupted = await failInterruptedJobs(db);
  if (interrupted > 0) {
    console.warn(
      `[Ekusupo API] marked ${interrupted} transfer(s) failed — they were interrupted by a restart.`,
    );
  }

  const { authService, rateLimits } = registerAuthRoutes(app, {
    userStore: options.userStore ?? new PostgresUserStore(db),
    sessionStore: options.sessionStore ?? new PostgresSessionStore(db),
    rateLimits: options.authRateLimits,
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
    // The same map the connect routes use, so a destination other than
    // Spotify can be constructed from the credentials already configured.
    providerCredentials: options.providerCredentials,
    startLimiter: options.transferStartLimiter,
  });

  // One set of limiters shared with the auth routes, so the password
  // budget cannot be sidestepped by moving between endpoints.
  registerAccountRoutes(app, { authService, providerConnectionStore, db, rateLimits });

  return app;
}
