import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";

import { InMemorySessionStore } from "./auth/session-store.js";
import type { SessionStore } from "./auth/session-store.js";
import { InMemoryUserStore } from "./auth/user-store.js";
import type { UserStore } from "./auth/user-store.js";
import { InMemoryProviderConnectionStore } from "./providers/provider-connection-store.js";
import type { ProviderConnectionStore } from "./providers/provider-connection-store.js";
import { registerAuthRoutes } from "./routes/auth-routes.js";
import type { ProviderRoutesConfig, ProviderRoutesDeps } from "./routes/provider-routes.js";
import { registerProviderRoutes } from "./routes/provider-routes.js";

export interface BuildServerOptions {
  corsOrigin?: string;
  userStore?: UserStore;
  sessionStore?: SessionStore;
  providerConnectionStore?: ProviderConnectionStore;
  providerRoutesConfig?: ProviderRoutesConfig;
  createSpotifyProviderImpl?: ProviderRoutesDeps["createSpotifyProviderImpl"];
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
    origin: options.corsOrigin ?? "http://localhost:5173",
    credentials: true,
  });

  app.get("/health", async () => ({ status: "ok" }));

  const authService = registerAuthRoutes(app, {
    userStore: options.userStore ?? new InMemoryUserStore(),
    sessionStore: options.sessionStore ?? new InMemorySessionStore(),
  });

  registerProviderRoutes(app, {
    authService,
    providerConnectionStore:
      options.providerConnectionStore ?? new InMemoryProviderConnectionStore(),
    config: options.providerRoutesConfig,
    createSpotifyProviderImpl: options.createSpotifyProviderImpl,
  });

  return app;
}
