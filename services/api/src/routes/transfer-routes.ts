import type { AuthSession, MusicProvider } from "@ekusupo/connector-sdk";
import { runDryRunTransfer, runLiveTransfer } from "@ekusupo/core";
import { createSpotifyAppSession, createSpotifyProvider } from "@ekusupo/provider-spotify";
import { parseUpfDocument } from "@ekusupo/upf";
import type { UpfDocument } from "@ekusupo/upf";
import type { FastifyInstance, FastifyReply } from "fastify";

import type { AuthService } from "../auth/auth-service.js";
import { requireAuth } from "../auth/session-cookie.js";
import type { Database } from "../db/client.js";
import { AppSessionCache } from "../providers/app-session-cache.js";
import { ProviderConnectionService } from "../providers/provider-connection-service.js";
import type { ProviderConnectionStore } from "../providers/provider-connection-store.js";
import type { ProviderCredentials } from "../providers/provider-registry.js";
import { findProvider } from "../providers/provider-registry.js";
import { PostgresTransferJobStore } from "../transfers/postgres-transfer-job-store.js";
import { UPF_DESTINATION_ID, describeWriteLimitation } from "../transfers/transfer-destination.js";
import { createUpfScratchFile } from "../transfers/upf-scratch-file.js";

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
  /**
   * Per-provider credentials keyed by provider id, so a destination other
   * than Spotify can be constructed. Same map `connect-routes.ts` uses.
   */
  providerCredentials?: Record<string, ProviderCredentials>;
}

const SOURCE_PLAYLIST_ID = { type: "string", minLength: 1, maxLength: 512 } as const;
const PROVIDER_ID = { type: "string", minLength: 1, maxLength: 64 } as const;

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
    properties: { sourcePlaylistId: SOURCE_PLAYLIST_ID, sourceProvider: PROVIDER_ID },
  },
};

/**
 * `confirm` is `const: true`, so the schema itself rejects a Live
 * Transfer that was not explicitly confirmed. A Live Transfer writes to a
 * real destination and CLAUDE.md §9.3 requires user confirmation for
 * exactly that; putting it in the schema means no handler can forget the
 * check, and a client that copies the Dry Run request shape gets a 400
 * rather than an unexpected write.
 */
const liveSchema = {
  body: {
    type: "object",
    required: ["sourcePlaylistId", "destinationProvider", "confirm"],
    properties: {
      sourcePlaylistId: SOURCE_PLAYLIST_ID,
      sourceProvider: PROVIDER_ID,
      destinationProvider: PROVIDER_ID,
      confirm: { const: true },
    },
  },
};

const importSchema = {
  body: {
    type: "object",
    required: ["document", "destinationProvider", "confirm"],
    properties: {
      document: { type: "object" },
      destinationProvider: PROVIDER_ID,
      /** Which playlist inside the document; the first one when omitted. */
      playlistId: { type: "string", maxLength: 512 },
      confirm: { const: true },
    },
  },
};

interface DryRunBody {
  sourcePlaylistId: string;
  sourceProvider?: string;
}

interface LiveBody extends DryRunBody {
  destinationProvider: string;
  confirm: true;
}

interface ImportBody {
  document: Record<string, unknown>;
  destinationProvider: string;
  playlistId?: string;
  confirm: true;
}

/** A resolved end of a transfer, plus whatever teardown it needs. */
interface TransferEnd {
  provider: MusicProvider;
  session: AuthSession;
  dispose: () => Promise<void>;
}

interface ResolvedDestination {
  end: TransferEnd;
  /** Whether the output is a downloadable document rather than provider writes. */
  isUpf: boolean;
  read: () => Promise<UpfDocument | undefined>;
}

const noDispose = async (): Promise<void> => undefined;

/**
 * Dry Run and Live Transfer (ADR-0011, ADR-0018, ADR-0027), plus UPF
 * export and import — which are the same engine with a file connector on
 * one end (ADR-0032), not a separate code path.
 */
export function registerTransferRoutes(app: FastifyInstance, deps: TransferRoutesDeps): void {
  const { authService, providerConnectionStore, db } = deps;
  const connectionService = new ProviderConnectionService(providerConnectionStore);
  const makeSpotifyProvider = deps.createSpotifyProviderImpl ?? createSpotifyProvider;
  const makeAppSession = deps.createSpotifyAppSessionImpl ?? createSpotifyAppSession;
  const credentials = deps.providerCredentials ?? {};

  const canReadPublicAnonymously = Boolean(deps.spotifyClientId && deps.spotifyClientSecret);
  const appSessions = new AppSessionCache(() =>
    makeAppSession({ clientId: deps.spotifyClientId, clientSecret: deps.spotifyClientSecret }),
  );

  /**
   * Spotify stays on its own injectable factory rather than going through
   * the registry: `createSpotifyProviderImpl` is how every existing test
   * substitutes a fake network, and routing Spotify through the registry
   * would quietly disable that seam.
   */
  function buildProvider(providerId: string): MusicProvider | undefined {
    if (providerId === "spotify") return makeSpotifyProvider();
    return findProvider(providerId)?.createProvider(credentials[providerId] ?? {});
  }

  /**
   * A connected account is preferred — it can read the user's own
   * private playlists. Falling back to the app-level token means a
   * public playlist link works with nothing connected at all, which is
   * the whole point: asking someone to hand over their Spotify account
   * before they can move a public playlist is friction for no benefit.
   *
   * The anonymous fallback is Spotify-only because it is the only
   * provider this server holds client-credentials for; the others need a
   * connected account or a developer token that is itself the connection.
   */
  async function resolveSourceSession(
    userId: string,
    providerId: string,
  ): Promise<{ session: AuthSession; appOnly: boolean } | undefined> {
    const connected = await connectionService.getSession(userId, providerId);
    if (connected) return { session: connected, appOnly: false };
    if (providerId !== "spotify" || !canReadPublicAnonymously) return undefined;
    return { session: await appSessions.get(), appOnly: true };
  }

  /** Replies and returns undefined when the source cannot be used. */
  async function resolveSource(
    userId: string,
    providerId: string,
    reply: FastifyReply,
  ): Promise<{ end: TransferEnd; appOnly: boolean } | undefined> {
    const provider = buildProvider(providerId);
    if (!provider) {
      reply.code(400);
      void reply.send({ error: `Unknown source provider "${providerId}".` });
      return undefined;
    }

    const resolved = await resolveSourceSession(userId, providerId);
    if (!resolved) {
      reply.code(400);
      void reply.send({
        error:
          providerId === "spotify"
            ? "Connect Spotify before starting a transfer. (This server has no Spotify credentials configured, so public playlists can't be read anonymously either.)"
            : `Connect ${providerId} before starting a transfer.`,
      });
      return undefined;
    }

    return {
      end: { provider, session: resolved.session, dispose: noDispose },
      appOnly: resolved.appOnly,
    };
  }

  /**
   * Replies and returns undefined when the destination cannot be written
   * to — the same "the helper sends its own error" convention
   * `requireAuth` established, so a caller only ever has to check for
   * `undefined`.
   */
  async function resolveDestination(
    userId: string,
    providerId: string,
    reply: FastifyReply,
  ): Promise<ResolvedDestination | undefined> {
    if (providerId === UPF_DESTINATION_ID) {
      const scratch = await createUpfScratchFile();
      return {
        end: { provider: scratch.provider, session: scratch.session, dispose: scratch.dispose },
        isUpf: true,
        read: scratch.read,
      };
    }

    const provider = buildProvider(providerId);
    if (!provider) {
      reply.code(400);
      reply.send({ error: `Unknown destination provider "${providerId}".` });
      return undefined;
    }

    const limitation = describeWriteLimitation(provider);
    if (limitation) {
      reply.code(400);
      reply.send({ error: limitation });
      return undefined;
    }

    const session = await connectionService.getSession(userId, providerId);
    if (!session) {
      reply.code(400);
      reply.send({
        error: `Connect ${provider.manifest.displayName} before transferring into it.`,
      });
      return undefined;
    }

    return {
      end: { provider, session, dispose: noDispose },
      isUpf: false,
      read: async () => undefined,
    };
  }

  app.post<{ Body: DryRunBody }>(
    "/transfers/dry-run",
    { schema: dryRunSchema },
    async (request, reply) => {
      const user = await requireAuth(request, reply, authService);
      if (!user) return;

      const sourceProviderId = request.body.sourceProvider ?? "spotify";
      const source = await resolveSource(user.id, sourceProviderId, reply);
      if (!source) return;

      const jobStore = new PostgresTransferJobStore(db, user.id);

      try {
        const { job, report } = await runDryRunTransfer({
          source: source.end.provider,
          sourceSession: source.end.session,
          destination: source.end.provider,
          destinationSession: source.end.session,
          sourcePlaylistId: request.body.sourcePlaylistId,
          jobStore,
        });

        // An app-level token can only see public data, so a failed read
        // here usually means the playlist is private rather than
        // missing. Saying "not found" would send someone hunting for a
        // typo when the real fix is to connect their account.
        if (job.status === "failed" && source.appOnly) {
          report.userActionsRequired.push(
            "This playlist isn't public. Connect your Spotify account to transfer your own private playlists.",
          );
        }

        await jobStore.saveReport(job.id, report);
        return { job: { ...job, report }, report, usedConnectedAccount: !source.appOnly };
      } catch (error) {
        console.warn("[Ekusupo API] Dry Run transfer failed", error);
        reply.code(502);
        return { error: "Could not run the transfer. Check the playlist ID and try again." };
      }
    },
  );

  app.post<{ Body: LiveBody }>(
    "/transfers/live",
    { schema: liveSchema },
    async (request, reply) => {
      const user = await requireAuth(request, reply, authService);
      if (!user) return;

      // Destination first, deliberately. A destination that cannot be
      // written to is a fixed fact about that provider's API — no amount
      // of connecting accounts will change it. Reporting the source
      // problem first would send someone off to connect an account and
      // then refuse them anyway, which is two round trips for one form.
      const destination = await resolveDestination(
        user.id,
        request.body.destinationProvider,
        reply,
      );
      if (!destination) return;

      const sourceProviderId = request.body.sourceProvider ?? "spotify";
      const source = await resolveSource(user.id, sourceProviderId, reply);
      if (!source) {
        // resolveDestination may already have opened a scratch file.
        await destination.end.dispose();
        return;
      }

      return runAndPersist({
        userId: user.id,
        source: source.end,
        destination,
        sourcePlaylistId: request.body.sourcePlaylistId,
        reply,
      });
    },
  );

  /**
   * Import is the same engine with the uploaded document as the source
   * (ADR-0032) — not a second write path with its own matching rules,
   * which is exactly the duplication CLAUDE.md §3.3 forbids.
   */
  app.post<{ Body: ImportBody }>(
    "/transfers/import-upf",
    { schema: importSchema },
    async (request, reply) => {
      const user = await requireAuth(request, reply, authService);
      if (!user) return;

      const parsed = parseUpfDocument(request.body.document);
      if (!parsed.ok) {
        reply.code(400);
        return { error: "That file is not a valid UPF document.", problems: parsed.errors };
      }

      const requestedId = request.body.playlistId;
      const playlist = requestedId
        ? parsed.document.playlists.find((candidate) => candidate.id === requestedId)
        : parsed.document.playlists[0];

      if (!playlist) {
        reply.code(400);
        return {
          error: requestedId
            ? `That file has no playlist "${requestedId}".`
            : "That file contains no playlists, so there is nothing to import.",
        };
      }

      const destination = await resolveDestination(
        user.id,
        request.body.destinationProvider,
        reply,
      );
      if (!destination) return;

      const scratch = await createUpfScratchFile(parsed.document);

      return runAndPersist({
        userId: user.id,
        source: {
          provider: scratch.provider,
          session: scratch.session,
          dispose: scratch.dispose,
        },
        destination,
        sourcePlaylistId: playlist.id,
        reply,
      });
    },
  );

  /** The shared tail of every Live Transfer: run it, store it, clean up. */
  async function runAndPersist(params: {
    userId: string;
    source: TransferEnd;
    destination: ResolvedDestination;
    sourcePlaylistId: string;
    reply: FastifyReply;
  }): Promise<unknown> {
    const { userId, source, destination, sourcePlaylistId, reply } = params;
    const jobStore = new PostgresTransferJobStore(db, userId);

    try {
      const { job, report } = await runLiveTransfer({
        source: source.provider,
        sourceSession: source.session,
        destination: destination.end.provider,
        destinationSession: destination.end.session,
        sourcePlaylistId,
        jobStore,
      });

      await jobStore.saveReport(job.id, report);

      let downloadUrl: string | undefined;
      if (destination.isUpf) {
        const document = await destination.read();
        if (document) {
          await jobStore.saveUpfDocument(job.id, document);
          downloadUrl = `/transfers/${job.id}/upf`;
        }
      }

      return { job: { ...job, report }, report, ...(downloadUrl ? { downloadUrl } : {}) };
    } catch (error) {
      console.warn("[Ekusupo API] Live Transfer failed", error);
      reply.code(502);
      return { error: "Could not run the transfer. Check the playlist ID and try again." };
    } finally {
      await Promise.all([source.dispose(), destination.end.dispose()]);
    }
  }

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

  app.get<{ Params: { id: string } }>("/transfers/:id/upf", async (request, reply) => {
    const user = await requireAuth(request, reply, authService);
    if (!user) return;

    const jobStore = new PostgresTransferJobStore(db, user.id);
    const document = await jobStore.findUpfDocument(request.params.id);
    if (!document) {
      reply.code(404);
      return { error: "No UPF export for that transfer." };
    }

    // `attachment` so a browser saves it rather than rendering JSON in a
    // tab, and a filename that says what it is a year from now.
    reply.header("Content-Type", "application/json; charset=utf-8");
    reply.header("Content-Disposition", `attachment; filename="${request.params.id}.upf.json"`);
    return document;
  });
}
