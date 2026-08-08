import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";

import { InMemorySessionStore } from "./auth/session-store.js";
import type { SessionStore } from "./auth/session-store.js";
import { InMemoryUserStore } from "./auth/user-store.js";
import type { UserStore } from "./auth/user-store.js";
import { registerAuthRoutes } from "./routes/auth-routes.js";

export interface BuildServerOptions {
  corsOrigin?: string;
  userStore?: UserStore;
  sessionStore?: SessionStore;
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

  registerAuthRoutes(app, {
    userStore: options.userStore ?? new InMemoryUserStore(),
    sessionStore: options.sessionStore ?? new InMemorySessionStore(),
  });

  return app;
}
