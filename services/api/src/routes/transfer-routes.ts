import { runDryRunTransfer } from "@ekusupo/core";
import { createSpotifyProvider } from "@ekusupo/provider-spotify";
import type { FastifyInstance } from "fastify";

import type { AuthService } from "../auth/auth-service.js";
import { requireAuth } from "../auth/session-cookie.js";
import type { Database } from "../db/client.js";
import { ProviderConnectionService } from "../providers/provider-connection-service.js";
import type { ProviderConnectionStore } from "../providers/provider-connection-store.js";
import { PostgresTransferJobStore } from "../transfers/postgres-transfer-job-store.js";

export interface TransferRoutesDeps {
  authService: AuthService;
  providerConnectionStore: ProviderConnectionStore;
  db: Database;
  /** Injectable, same pattern as `provider-routes.ts`'s own `createSpotifyProviderImpl`. */
  createSpotifyProviderImpl?: typeof createSpotifyProvider;
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

  app.post<{ Body: { sourcePlaylistId: string } }>(
    "/transfers/dry-run",
    { schema: dryRunSchema },
    async (request, reply) => {
      const user = await requireAuth(request, reply, authService);
      if (!user) return;

      const sourcePlaylistId = request.body.sourcePlaylistId;

      const session = await connectionService.getSession(user.id, "spotify");
      if (!session) {
        reply.code(400);
        return { error: "Connect Spotify before starting a transfer." };
      }

      const provider = makeSpotifyProvider();
      const jobStore = new PostgresTransferJobStore(db, user.id);

      try {
        const { job, report } = await runDryRunTransfer({
          source: provider,
          sourceSession: session,
          destination: provider,
          destinationSession: session,
          sourcePlaylistId,
          jobStore,
        });
        await jobStore.saveReport(job.id, report);
        return { job: { ...job, report }, report };
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
