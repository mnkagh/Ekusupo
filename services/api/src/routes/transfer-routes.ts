import type { AuthSession } from "@ekusupo/connector-sdk";
import { runDryRunTransfer } from "@ekusupo/core";
import { createSpotifyAppSession, createSpotifyProvider } from "@ekusupo/provider-spotify";
import type { FastifyInstance } from "fastify";

import type { AuthService } from "../auth/auth-service.js";
import { requireAuth } from "../auth/session-cookie.js";
import type { Database } from "../db/client.js";
import { AppSessionCache } from "../providers/app-session-cache.js";
import { ProviderConnectionService } from "../providers/provider-connection-service.js";
import type { ProviderConnectionStore } from "../providers/provider-connection-store.js";
import { PostgresTransferJobStore } from "../transfers/postgres-transfer-job-store.js";

export interface TransferRoutesDeps {
  authService: AuthService;
  providerConnectionStore: ProviderConnectionStore;
  db: Database;
  /** Injectable, same pattern as `provider-routes.ts`'s own `createSpotifyProviderImpl`. */
  createSpotifyProviderImpl?: typeof createSpotifyProvider;
  /** Needed for the anonymous public-playlist path; without them only connected users can transfer. */
  spotifyClientId?: string;
  spotifyClientSecret?: string;
  /** Injectable for tests, same reason as `createSpotifyProviderImpl`. */
  createSpotifyAppSessionImpl?: typeof createSpotifyAppSession;
}

/**
 * Validated by Fastify rather than by hand, the same way
 * `auth-routes.ts` validates credentials. Without the schema a JSON
 * number or object satisfies a truthiness check and reaches the
 * provider as a non-string playlist id.
 */
const dryRunSchema = {
  body: {
    type: "object",
    required: ["sourcePlaylistId"],
    properties: {
      sourcePlaylistId: { type: "string", minLength: 1, maxLength: 512 },
    },
  },
};

/**
 * The Dry Run execution mode only (ADR-0011, ADR-0027) — Live Transfer
 * isn't wired up here yet. Source and destination are both the caller's
 * connected Spotify account, the same "no destination-selection UI yet"
 * scope reduction `apps/extension`'s PR5 already established
 * (`transfer-orchestrator.ts`), not a new decision.
 */
export function registerTransferRoutes(app: FastifyInstance, deps: TransferRoutesDeps): void {
  const { authService, providerConnectionStore, db } = deps;
  const connectionService = new ProviderConnectionService(providerConnectionStore);
  const makeSpotifyProvider = deps.createSpotifyProviderImpl ?? createSpotifyProvider;
  const makeAppSession = deps.createSpotifyAppSessionImpl ?? createSpotifyAppSession;

  const canReadPublicAnonymously = Boolean(deps.spotifyClientId && deps.spotifyClientSecret);
  const appSessions = new AppSessionCache(() =>
    makeAppSession({ clientId: deps.spotifyClientId, clientSecret: deps.spotifyClientSecret }),
  );

  /**
   * A connected account is preferred — it can read the user's own
   * private playlists. Falling back to the app-level token means a
   * public playlist link works with nothing connected at all, which is
   * the whole point: asking someone to hand over their Spotify account
   * before they can move a public playlist is friction for no benefit.
   */
  async function resolveSourceSession(
    userId: string,
  ): Promise<{ session: AuthSession; appOnly: boolean } | undefined> {
    const connected = await connectionService.getSession(userId, "spotify");
    if (connected) return { session: connected, appOnly: false };
    if (!canReadPublicAnonymously) return undefined;
    return { session: await appSessions.get(), appOnly: true };
  }

  app.post<{ Body: { sourcePlaylistId: string } }>(
    "/transfers/dry-run",
    { schema: dryRunSchema },
    async (request, reply) => {
      const user = await requireAuth(request, reply, authService);
      if (!user) return;

      const sourcePlaylistId = request.body.sourcePlaylistId;

      const resolved = await resolveSourceSession(user.id);
      if (!resolved) {
        reply.code(400);
        return {
          error:
            "Connect Spotify before starting a transfer. (This server has no Spotify credentials configured, so public playlists can't be read anonymously either.)",
        };
      }

      const provider = makeSpotifyProvider();
      const jobStore = new PostgresTransferJobStore(db, user.id);

      try {
        const { job, report } = await runDryRunTransfer({
          source: provider,
          sourceSession: resolved.session,
          destination: provider,
          destinationSession: resolved.session,
          sourcePlaylistId,
          jobStore,
        });

        // An app-level token can only see public data, so a failed read
        // here usually means the playlist is private rather than
        // missing. Saying "not found" would send someone hunting for a
        // typo when the real fix is to connect their account.
        if (job.status === "failed" && resolved.appOnly) {
          report.userActionsRequired.push(
            "This playlist isn't public. Connect your Spotify account to transfer your own private playlists.",
          );
        }

        await jobStore.saveReport(job.id, report);
        return { job: { ...job, report }, report, usedConnectedAccount: !resolved.appOnly };
      } catch (error) {
        console.warn("[Ekusupo API] Dry Run transfer failed", error);
        reply.code(502);
        return { error: "Could not run the transfer. Check the playlist ID and try again." };
      }
    },
  );

  app.get("/transfers", async (request, reply) => {
    const user = await requireAuth(request, reply, authService);
    if (!user) return;

    const jobStore = new PostgresTransferJobStore(db, user.id);
    return { transfers: await jobStore.listForUser() };
  });

  app.get<{ Params: { id: string } }>("/transfers/:id", async (request, reply) => {
    const user = await requireAuth(request, reply, authService);
    if (!user) return;

    const jobStore = new PostgresTransferJobStore(db, user.id);
    const job = await jobStore.findByIdForUser(request.params.id);
    if (!job) {
      reply.code(404);
      return { error: "Transfer not found." };
    }
    return { transfer: job };
  });
}
