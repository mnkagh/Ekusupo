import Fastify from "fastify";
import type { FastifyInstance } from "fastify";

/**
 * A factory, not a module-level singleton — tests build their own
 * instance and use `.inject()` rather than binding a real port, the
 * same "no live network involved" testing style used throughout this
 * repo (packages/providers/spotify's fetchImpl injection, etc.).
 */
export function buildServer(): FastifyInstance {
  const app = Fastify();

  app.get("/health", async () => ({ status: "ok" }));

  return app;
}
