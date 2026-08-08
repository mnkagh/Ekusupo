import { PostgresSessionStore } from "./auth/postgres-session-store.js";
import { PostgresUserStore } from "./auth/postgres-user-store.js";
import { ensureSchema } from "./db/bootstrap.js";
import { createDb } from "./db/client.js";
import { PostgresProviderConnectionStore } from "./providers/postgres-provider-connection-store.js";
import { buildServer } from "./server.js";

const port = Number(process.env.PORT ?? 3000);
// A real path, unlike buildServer()'s own in-memory-by-default (test)
// path — data survives a restart. See ADR-0024.
const databasePath = process.env.DATABASE_PATH ?? "./data/ekusupo-db";
const webAppUrl = process.env.WEB_APP_URL ?? "http://localhost:5173";

async function main(): Promise<void> {
  const db = createDb(databasePath);
  await ensureSchema(db);

  const app = await buildServer({
    corsOrigin: webAppUrl,
    userStore: new PostgresUserStore(db),
    sessionStore: new PostgresSessionStore(db),
    providerConnectionStore: new PostgresProviderConnectionStore(db),
    providerRoutesConfig: {
      spotifyClientId: process.env.SPOTIFY_CLIENT_ID,
      spotifyClientSecret: process.env.SPOTIFY_CLIENT_SECRET,
      spotifyRedirectUri: process.env.SPOTIFY_REDIRECT_URI,
      webAppUrl,
    },
  });

  await app.listen({ port, host: "0.0.0.0" });
  console.log(`[Ekusupo API] listening on port ${port} (database: ${databasePath})`);
  if (!process.env.SPOTIFY_CLIENT_ID) {
    console.log(
      "[Ekusupo API] SPOTIFY_CLIENT_ID not set — /providers/spotify/connect will return 400 until it is. See ADR-0025.",
    );
  }
}

main().catch((error: unknown) => {
  console.error("[Ekusupo API] failed to start", error);
  process.exit(1);
});
