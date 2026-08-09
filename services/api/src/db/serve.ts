import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

import { ensureSchema } from "./bootstrap.js";
import { createDbFromClient, createPgliteClient } from "./client.js";

/**
 * Exposes the embedded database over the real Postgres wire protocol so
 * standard tools — pgAdmin, psql, DBeaver, TablePlus — can browse it.
 *
 * `pglite` normally runs *inside* the API process and never opens a
 * port, which is why nothing can connect to it by default. This script
 * wraps the same on-disk data directory in a socket server instead.
 *
 * Two deliberate constraints:
 *
 * 1. **Bound to 127.0.0.1**, never 0.0.0.0. The database holds password
 *    hashes and encrypted provider tokens; it must not be reachable from
 *    the network (CLAUDE.md §12.4). There is also no authentication on
 *    this socket — anything that can reach the port has full access,
 *    which is exactly why it stays on loopback.
 * 2. **Stop the API server first.** `pglite` is single-process: one data
 *    directory, one owner. Running this alongside `pnpm start` against
 *    the same directory risks corrupting it.
 *
 * A development inspection tool, not part of the running service.
 */
const port = Number(process.env.DB_SOCKET_PORT ?? 5432);
const databasePath = process.env.DATABASE_PATH ?? "./data/ekusupo-db";

async function main(): Promise<void> {
  // One client, shared by the schema bootstrap and the socket server —
  // opening a second instance on the same directory is the corruption
  // risk this script warns about.
  const client = createPgliteClient(databasePath);
  await client.waitReady;
  // Creates the tables if this is a fresh directory, so a browsing tool
  // shows an empty schema rather than no schema at all.
  await ensureSchema(createDbFromClient(client));

  const server = new PGLiteSocketServer({
    db: client,
    port,
    host: "127.0.0.1",
    debug: process.env.DB_SOCKET_DEBUG === "1",
  });
  server.addEventListener("error", (event) => {
    console.error("[Ekusupo DB] socket error", (event as CustomEvent).detail ?? event);
  });
  await server.start();

  console.log(`[Ekusupo DB] serving ${databasePath} on postgres://127.0.0.1:${port}`);
  console.log("[Ekusupo DB] connect with any Postgres client:");
  console.log("             host 127.0.0.1   port " + port + "   database postgres");
  console.log("             username postgres   password (leave blank)");
  console.log("[Ekusupo DB] stop the API server while using this — pglite is single-process.");

  const shutdown = async (): Promise<void> => {
    await server.stop();
    await client.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

main().catch((error: unknown) => {
  console.error("[Ekusupo DB] failed to start", error);
  process.exit(1);
});
