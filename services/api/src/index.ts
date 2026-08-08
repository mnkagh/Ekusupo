import { PostgresSessionStore } from "./auth/postgres-session-store.js";
import { PostgresUserStore } from "./auth/postgres-user-store.js";
import { ensureSchema } from "./db/bootstrap.js";
import { createDb } from "./db/client.js";
import { buildServer } from "./server.js";

const port = Number(process.env.PORT ?? 3000);
// A real path, unlike buildServer()'s own in-memory-by-default (test)
// path — data survives a restart. See ADR-0024.
const databasePath = process.env.DATABASE_PATH ?? "./data/ekusupo-db";

async function main(): Promise<void> {
  const db = createDb(databasePath);
  await ensureSchema(db);

  const app = await buildServer({
    userStore: new PostgresUserStore(db),
    sessionStore: new PostgresSessionStore(db),
  });

  await app.listen({ port, host: "0.0.0.0" });
  console.log(`[Ekusupo API] listening on port ${port} (database: ${databasePath})`);
}

main().catch((error: unknown) => {
  console.error("[Ekusupo API] failed to start", error);
  process.exit(1);
});
