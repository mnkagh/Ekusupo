import type { AuthSession, MusicProvider } from "@ekusupo/connector-sdk";
import { createSpotifyAppSession, createSpotifyProvider } from "@ekusupo/provider-spotify";
import {
  parseTracklist,
  parseUpfDocument,
  tracklistToPlaylist,
  UPF_FORMAT_NAME,
  UPF_FORMAT_VERSION,
} from "@ekusupo/upf";
import type { UpfDocument } from "@ekusupo/upf";
import type { FastifyInstance, FastifyReply } from "fastify";

import type { AuthService } from "../auth/auth-service.js";
import { enforceUserRateLimit } from "../auth/rate-limit-guard.js";
import { RateLimiter } from "../auth/rate-limiter.js";
import { requireAuth } from "../auth/session-cookie.js";
import type { Database } from "../db/client.js";
import { AppSessionCache } from "../providers/app-session-cache.js";
import { ProviderConnectionService } from "../providers/provider-connection-service.js";
import type { ProviderConnectionStore } from "../providers/provider-connection-store.js";
import type { ProviderCredentials } from "../providers/provider-registry.js";
import { findProvider } from "../providers/provider-registry.js";
import { sessionWithRefresh } from "../providers/session-refresher.js";
import { PostgresTransferJobStore } from "../transfers/postgres-transfer-job-store.js";
import { UPF_DESTINATION_ID, describeWriteLimitation } from "../transfers/transfer-destination.js";
import { TransferRunner } from "../transfers/transfer-runner.js";
import type { StartTransferParams, TransferEnd } from "../transfers/transfer-runner.js";
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
  /**
   * How many transfers one account may start per window. Injectable so a
   * test can set a limit of one instead of starting thirty real jobs.
   */
  startLimiter?: RateLimiter;
}

const FIFTEEN_MINUTES = 15 * 60 * 1000;
const START_SCOPE = "transfer-start";

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

const tracklistSchema = {
  body: {
    type: "object",
    required: ["text", "destinationProvider", "confirm"],
    properties: {
      // Capped generously: a very long playlist pasted as text is the
      // point of the feature, but an unbounded body is a denial-of-
      // service surface.
      text: { type: "string", minLength: 1, maxLength: 500_000 },
      destinationProvider: PROVIDER_ID,
      title: { type: "string", minLength: 1, maxLength: 200 },
      confirm: { const: true },
    },
  },
};

interface TracklistBody {
  text: string;
  destinationProvider: string;
  title?: string;
  confirm: true;
}

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
  const runner = new TransferRunner(db);

  /**
   * Starting a transfer is the most expensive thing an account can ask
   * for: it spawns background work that reads a whole playlist and then
   * searches the destination once per track. Unthrottled, one signed-in
   * account could queue thousands and spend both this server's capacity
   * and the *provider's* rate limit, which is shared across every user
   * of these credentials (CLAUDE.md §12.6, §13.3).
   *
   * Thirty per fifteen minutes is well past what migrating a library by
   * hand looks like, and nowhere near what a script wants.
   */
  const startLimiter =
    deps.startLimiter ?? new RateLimiter({ limit: 30, windowMs: FIFTEEN_MINUTES });

  /** Returns false and has already answered 429 when the budget is spent. */
  function allowStart(reply: FastifyReply, userId: string): boolean {
    return enforceUserRateLimit(
      reply,
      startLimiter,
      START_SCOPE,
      userId,
      "Too many transfers started. Wait a few minutes and try again.",
    );
  }

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
    provider: MusicProvider,
  ): Promise<{ session: AuthSession; appOnly: boolean } | undefined> {
    // Refreshed if it is at or near expiry, and re-stored — a Spotify
    // token lasts an hour, so without this a connection made yesterday
    // fails today with an authentication error the user cannot act on.
    const connected = await sessionWithRefresh(userId, providerId, provider, { connectionService });
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

    const resolved = await resolveSourceSession(userId, providerId, provider);
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

    // Refreshed if near expiry — a write can be minutes of work, and
    // running out of credential halfway through leaves a half-written
    // playlist on the destination.
    const session = await sessionWithRefresh(userId, providerId, provider, { connectionService });
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
      if (!allowStart(reply, user.id)) return;

      const sourceProviderId = request.body.sourceProvider ?? "spotify";
      const source = await resolveSource(user.id, sourceProviderId, reply);
      if (!source) return;

      const jobStore = new PostgresTransferJobStore(db, user.id);

      return startJob(
        reply,
        {
          userId: user.id,
          mode: "dryRun",
          source: source.end,
          // Nothing is written, so there is no destination to choose —
          // matching still needs one, and the source is the only provider
          // in hand.
          destination: source.end,
          sourcePlaylistId: request.body.sourcePlaylistId,
          onFinished: ({ job, report }) => {
            // An app-level token can only see public data, so a failed read
            // usually means the playlist is private rather than missing.
            // Saying "not found" would send someone hunting for a typo when
            // the real fix is to connect their account.
            if (job.status !== "failed" || !source.appOnly) return;
            report.userActionsRequired.push(
              "This playlist isn't public. Connect your Spotify account to transfer your own private playlists.",
            );
            void jobStore.saveReport(job.id, report).catch(() => undefined);
          },
        },
        // Known before the transfer runs, and worth saying immediately:
        // an anonymous read can only see public playlists.
        { usedConnectedAccount: !source.appOnly },
      );
    },
  );

  app.post<{ Body: LiveBody }>(
    "/transfers/live",
    { schema: liveSchema },
    async (request, reply) => {
      const user = await requireAuth(request, reply, authService);
      if (!user) return;
      if (!allowStart(reply, user.id)) return;

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

      return startJob(reply, {
        userId: user.id,
        mode: "live",
        source: source.end,
        destination: destination.end,
        sourcePlaylistId: request.body.sourcePlaylistId,
        collectUpfDocument: destination.read,
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
      if (!allowStart(reply, user.id)) return;

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

      return startJob(reply, {
        userId: user.id,
        mode: "live",
        source: {
          provider: scratch.provider,
          session: scratch.session,
          dispose: scratch.dispose,
        },
        destination: destination.end,
        sourcePlaylistId: playlist.id,
        collectUpfDocument: destination.read,
      });
    },
  );

  /**
   * Hands the work to the runner and answers **202 Accepted** with the
   * job — not the finished report. A transfer makes one provider call per
   * track, so a few hundred tracks is minutes of work; holding the
   * request open for it would hit every timeout between here and the
   * browser and give the user nothing to look at meanwhile
   * (CLAUDE.md §13.2). Poll `GET /transfers/:id`.
   */
  async function startJob(
    reply: FastifyReply,
    params: StartTransferParams,
    extra: Record<string, unknown> = {},
  ): Promise<unknown> {
    try {
      const job = await runner.start(params);
      reply.code(202);
      return { job, pollUrl: `/transfers/${job.id}`, ...extra };
    } catch (error) {
      // Only a failure to *record* the job reaches here — the engine
      // reports transfer failures in the job itself rather than throwing.
      console.warn("[Ekusupo API] could not start transfer", error);
      await Promise.all([
        params.source.dispose().catch(() => undefined),
        params.destination.dispose().catch(() => undefined),
      ]);
      reply.code(502);
      return { error: "Could not start the transfer. Try again." };
    }
  }

  /**
   * Cooperative cancellation (CLAUDE.md §9.3): this writes the status and
   * the engine notices between tracks. Tracks already written to a
   * destination stay written — a transfer is not a transaction, and
   * pretending otherwise would mean silently deleting things the user can
   * see. The report says how far it got.
   */
  app.post<{ Params: { id: string } }>("/transfers/:id/cancel", async (request, reply) => {
    const user = await requireAuth(request, reply, authService);
    if (!user) return;

    const jobStore = new PostgresTransferJobStore(db, user.id);
    const job = await jobStore.findByIdForUser(request.params.id);
    if (!job) {
      reply.code(404);
      return { error: "Transfer not found." };
    }

    const cancelled = await jobStore.cancel(request.params.id);
    if (!cancelled) {
      reply.code(409);
      return { error: `That transfer already ${job.status}. There is nothing to cancel.` };
    }
    return { cancelled: true };
  });

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

  /**
   * A playlist someone pasted as plain text.
   *
   * The source here is not a provider at all — it is a note, a
   * spreadsheet column, a message from a friend. That is the whole
   * point: getting a list like that into a music service is exactly the
   * manual work this product exists to remove, and it needs no
   * integration on the source side.
   *
   * Once parsed it joins the ordinary path: the tracks become a UPF
   * document, and the same scratch-file connector and engine that serve
   * UPF import take it from there. Nothing about matching or writing is
   * special-cased for pasted text.
   */
  app.post<{ Body: TracklistBody }>(
    "/transfers/import-tracklist",
    { schema: tracklistSchema },
    async (request, reply) => {
      const user = await requireAuth(request, reply, authService);
      if (!user) return;
      if (!allowStart(reply, user.id)) return;

      const { tracks, skipped } = parseTracklist(request.body.text);
      if (tracks.length === 0) {
        reply.code(400);
        return {
          error: "Nothing in that text looked like a track. Use one “Artist - Title” per line.",
          problems: skipped.map((entry) => ({
            path: `line ${entry.line}`,
            message: entry.reason,
          })),
        };
      }

      const destination = await resolveDestination(
        user.id,
        request.body.destinationProvider,
        reply,
      );
      if (!destination) return;

      const playlist = tracklistToPlaylist(request.body.title ?? "Pasted playlist", tracks);
      const document: UpfDocument = {
        format: UPF_FORMAT_NAME,
        version: UPF_FORMAT_VERSION,
        createdAt: new Date().toISOString(),
        playlists: [playlist],
      };

      const scratch = await createUpfScratchFile(document);

      const started = await startJob(reply, {
        userId: user.id,
        mode: "live",
        source: {
          provider: scratch.provider,
          session: scratch.session,
          dispose: scratch.dispose,
        },
        destination: destination.end,
        sourcePlaylistId: playlist.id,
        collectUpfDocument: destination.read,
      });

      // Lines that could not be read are returned with the job rather
      // than dropped: the transfer is genuinely missing them, and the
      // user is the only one who can fix the text.
      return skipped.length > 0
        ? { ...(started as Record<string, unknown>), skippedLines: skipped }
        : started;
    },
  );

  /**
   * Removes a finished transfer from history, with its report and its
   * UPF export (CLAUDE.md §21.2). A live transfer has to be cancelled
   * first — see `deleteForUser` for why deleting one mid-flight is not
   * merely rude but actively broken.
   */
  app.delete<{ Params: { id: string } }>("/transfers/:id", async (request, reply) => {
    const user = await requireAuth(request, reply, authService);
    if (!user) return;

    const jobStore = new PostgresTransferJobStore(db, user.id);
    const job = await jobStore.findByIdForUser(request.params.id);
    if (!job) {
      reply.code(404);
      return { error: "Transfer not found." };
    }

    const deleted = await jobStore.deleteForUser(request.params.id);
    if (!deleted) {
      reply.code(409);
      return { error: "That transfer is still running. Cancel it before deleting it." };
    }
    return { deleted: true };
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
