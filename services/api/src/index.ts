import { PostgresSessionStore } from "./auth/postgres-session-store.js";
import { PostgresUserStore } from "./auth/postgres-user-store.js";
import { corsOriginsFor } from "./cors-origins.js";
import { createDb } from "./db/client.js";
import { PostgresProviderConnectionStore } from "./providers/postgres-provider-connection-store.js";
import { buildServer } from "./server.js";

const port = Number(process.env.PORT ?? 3000);
// A real path, unlike buildServer()'s own in-memory-by-default (test)
// path — data survives a restart. See ADR-0024.
const databasePath = process.env.DATABASE_PATH ?? "./data/ekusupo-db";
const webAppUrl = process.env.WEB_APP_URL ?? "http://localhost:5173";

async function main(): Promise<void> {
  // Passed straight into buildServer(), which calls ensureSchema() on
  // whatever db it's given (own default or this one) — see ADR-0027.
  const db = createDb(databasePath);

  const app = await buildServer({
    // Both loopback spellings, so the dashboard works whether it's
    // opened at localhost or 127.0.0.1 — see cors-origins.ts.
    corsOrigin: corsOriginsFor(webAppUrl),
    userStore: new PostgresUserStore(db),
    sessionStore: new PostgresSessionStore(db),
    providerConnectionStore: new PostgresProviderConnectionStore(db),
    db,
    providerCredentials: {
      spotify: {
        clientId: process.env.SPOTIFY_CLIENT_ID,
        clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
        redirectUri: process.env.SPOTIFY_REDIRECT_URI,
      },
      "youtube-music": {
        clientId: process.env.YOUTUBE_CLIENT_ID,
        clientSecret: process.env.YOUTUBE_CLIENT_SECRET,
        redirectUri: process.env.YOUTUBE_REDIRECT_URI,
      },
      "apple-music": {
        developerToken: process.env.APPLE_MUSIC_DEVELOPER_TOKEN,
      },
    },
    providerRoutesConfig: {
      spotifyClientId: process.env.SPOTIFY_CLIENT_ID,
      spotifyClientSecret: process.env.SPOTIFY_CLIENT_SECRET,
      spotifyRedirectUri: process.env.SPOTIFY_REDIRECT_URI,
      webAppUrl,
    },
  });

  // `docker stop` sends SIGTERM and waits ten seconds before SIGKILL.
  // Without this the process died with the database mid-write and with
  // connections still open — survivable for pglite, but it is a real
  // on-disk database (unlike the in-memory one tests use), so shutting
  // it down cleanly is the difference between a checkpointed file and
  // one that has to recover on next boot.
  let shuttingDown = false;
  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.on(signal, () => {
      if (shuttingDown) return; // a second Ctrl-C shouldn't re-enter this
      shuttingDown = true;
      console.log(`[Ekusupo API] ${signal} received — shutting down`);
      void (async () => {
        try {
          await app.close(); // stops accepting, drains in-flight requests
          await db.$client.close();
          process.exit(0);
        } catch (error) {
          console.error("[Ekusupo API] shutdown failed", error);
          process.exit(1);
        }
      })();
    });
  }

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
