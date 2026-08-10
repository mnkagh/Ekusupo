import type { AuthSession, MusicProvider } from "@ekusupo/connector-sdk";
import type { Playlist, Track } from "@ekusupo/upf";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ensureSchema, failInterruptedJobs } from "../db/bootstrap.js";
import { createDb } from "../db/client.js";
import type { Database } from "../db/client.js";
import { usersTable } from "../db/schema.js";
import { PostgresTransferJobStore } from "./postgres-transfer-job-store.js";
import { TransferRunner } from "./transfer-runner.js";

const USER = "11111111-1111-1111-1111-111111111111";
const SESSION: AuthSession = { method: "none", raw: {} };

function track(index: number): Track {
  return { id: `t${index}`, title: `Track ${index}`, artists: [{ id: "a1", name: "Someone" }] };
}

function playlistOf(count: number): Playlist {
  return {
    id: "playlist-1",
    title: "A playlist",
    items: Array.from({ length: count }, (_, index) => ({ track: track(index) })),
  };
}

/**
 * A read-only source, like Spotify's real connector. `beforeRead` is a
 * hook the test uses to interleave with the run — the runner is
 * deliberately not awaited, so this is how a test reaches inside it.
 */
function fakeSource(
  playlist: Playlist | Error,
  hooks: { beforeRead?: () => Promise<void> } = {},
): MusicProvider {
  return {
    manifest: {
      name: "fake-source",
      displayName: "Fake Source",
      version: "0.0.0",
      authenticationMethods: ["oauth2"],
      supportedCapabilities: new Set(["playlists.read"]),
    },
    getCapabilities: () => ({ supports: new Set(["playlists.read"]) }),
    authenticate: async () => SESSION,
    refreshAuthentication: async (s: AuthSession) => s,
    revokeAuthentication: async () => {},
    getPlaylist: async () => {
      await hooks.beforeRead?.();
      if (playlist instanceof Error) throw playlist;
      return playlist;
    },
  } as unknown as MusicProvider;
}

let db: Database;
let runner: TransferRunner;
let store: PostgresTransferJobStore;

beforeEach(async () => {
  db = createDb();
  await ensureSchema(db);
  await db
    .insert(usersTable)
    .values({ id: USER, email: "a@example.com", passwordHash: "x", createdAt: new Date() });
  runner = new TransferRunner(db);
  store = new PostgresTransferJobStore(db, USER);
});

const TERMINAL = new Set(["completed", "partial", "failed", "cancelled"]);

async function waitForTerminal(jobId: string) {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    const job = await store.findByIdForUser(jobId);
    if (job && TERMINAL.has(job.status)) return job;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("job never reached a terminal status");
}

function endFor(provider: MusicProvider, dispose = async () => {}) {
  return { provider, session: SESSION, dispose };
}

describe("TransferRunner", () => {
  it("returns a job id before the transfer has finished", async () => {
    let releaseRead: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      releaseRead = resolve;
    });
    const source = fakeSource(playlistOf(2), { beforeRead: () => held });

    const job = await runner.start({
      userId: USER,
      mode: "dryRun",
      source: endFor(source),
      destination: endFor(source),
      sourcePlaylistId: "playlist-1",
    });

    // The whole point of ADR-0033: the caller has an id while the work is
    // still blocked inside the provider.
    expect(job.id).toBeTruthy();
    expect(TERMINAL.has(job.status)).toBe(false);

    releaseRead();
    await waitForTerminal(job.id);
  });

  it("records the finished report against the job", async () => {
    const source = fakeSource(playlistOf(3));

    const job = await runner.start({
      userId: USER,
      mode: "dryRun",
      source: endFor(source),
      destination: endFor(source),
      sourcePlaylistId: "playlist-1",
    });

    const finished = await waitForTerminal(job.id);
    expect(finished.report?.totalItems).toBe(3);
  });

  it("does not report a job terminal until its document is stored", async () => {
    // The race this guards: the engine writes its final status and only
    // then returns, so a naive runner would let a poller see `completed`
    // and download a file that had not been saved yet.
    const source = fakeSource(playlistOf(1));
    let documentStored = false;

    const job = await runner.start({
      userId: USER,
      mode: "dryRun",
      source: endFor(source),
      destination: endFor(source),
      sourcePlaylistId: "playlist-1",
      collectUpfDocument: async () => {
        // Terminal must not be visible while this is still resolving.
        const midway = await store.findByIdForUser(job.id);
        expect(TERMINAL.has(midway?.status ?? "")).toBe(false);
        documentStored = true;
        return {
          format: "upf" as const,
          version: "0.1.0",
          createdAt: "2026-01-01T00:00:00.000Z",
          playlists: [],
        };
      },
    });

    await waitForTerminal(job.id);
    expect(documentStored).toBe(true);
    expect((await store.findByIdForUser(job.id))?.hasUpfDocument).toBe(true);
  });

  it("stores progress as the transfer moves", async () => {
    const source = fakeSource(playlistOf(4));

    const job = await runner.start({
      userId: USER,
      mode: "dryRun",
      source: endFor(source),
      destination: endFor(source),
      sourcePlaylistId: "playlist-1",
    });

    const finished = await waitForTerminal(job.id);
    // `done` is always written, whatever the throttle dropped in between.
    expect(finished.progress?.step).toBe("done");
    expect(finished.progress?.total).toBe(4);
  });

  it("stops a running transfer when the job is cancelled", async () => {
    let readsStarted = 0;
    const source = fakeSource(playlistOf(50), {
      beforeRead: async () => {
        readsStarted += 1;
      },
    });

    const job = await runner.start({
      userId: USER,
      mode: "dryRun",
      source: endFor(source),
      destination: endFor(source),
      sourcePlaylistId: "playlist-1",
    });

    // Cancellation is cooperative: writing the status is the whole
    // mechanism, and the engine notices between tracks.
    expect(await store.cancel(job.id)).toBe(true);

    const finished = await waitForTerminal(job.id);
    expect(finished.status).toBe("cancelled");
    expect(readsStarted).toBe(1);
  });

  it("refuses to cancel a job that already finished", async () => {
    const source = fakeSource(playlistOf(1));
    const job = await runner.start({
      userId: USER,
      mode: "dryRun",
      source: endFor(source),
      destination: endFor(source),
      sourcePlaylistId: "playlist-1",
    });
    await waitForTerminal(job.id);

    expect(await store.cancel(job.id)).toBe(false);
  });

  it("disposes both ends even when the transfer fails", async () => {
    const source = fakeSource(new Error("playlist not found"));
    const disposeSource = vi.fn(async () => {});
    const disposeDestination = vi.fn(async () => {});

    const job = await runner.start({
      userId: USER,
      mode: "dryRun",
      source: endFor(source, disposeSource),
      destination: endFor(source, disposeDestination),
      sourcePlaylistId: "playlist-1",
    });

    const finished = await waitForTerminal(job.id);
    expect(finished.status).toBe("failed");
    // A scratch file left behind by every failed transfer would
    // accumulate silently.
    expect(disposeSource).toHaveBeenCalledTimes(1);
    expect(disposeDestination).toHaveBeenCalledTimes(1);
  });

  it("marks the job failed rather than leaving it running when storage breaks", async () => {
    const source = fakeSource(playlistOf(1));

    const job = await runner.start({
      userId: USER,
      mode: "dryRun",
      source: endFor(source),
      destination: endFor(source),
      sourcePlaylistId: "playlist-1",
      collectUpfDocument: async () => {
        throw new Error("disk on fire");
      },
    });

    const finished = await waitForTerminal(job.id);
    expect(finished.status).toBe("failed");
    expect(finished.report?.failureReason).toMatch(/stopped unexpectedly/);
  });
});

describe("failInterruptedJobs", () => {
  it("fails jobs left running by a process that is gone", async () => {
    const source = fakeSource(playlistOf(1));
    const job = await runner.start({
      userId: USER,
      mode: "dryRun",
      source: endFor(source),
      destination: endFor(source),
      sourcePlaylistId: "playlist-1",
    });
    await waitForTerminal(job.id);

    // Put it back into the state a killed process would have left.
    await store.update(job.id, { status: "running", updatedAt: new Date().toISOString() });

    expect(await failInterruptedJobs(db)).toBe(1);

    const recovered = await store.findByIdForUser(job.id);
    expect(recovered?.status).toBe("failed");
    expect(recovered?.report?.failureReason).toMatch(/Interrupted by a server restart/);
  });

  it("leaves finished jobs alone", async () => {
    const source = fakeSource(playlistOf(1));
    const job = await runner.start({
      userId: USER,
      mode: "dryRun",
      source: endFor(source),
      destination: endFor(source),
      sourcePlaylistId: "playlist-1",
    });
    const finished = await waitForTerminal(job.id);

    expect(await failInterruptedJobs(db)).toBe(0);
    expect((await store.findByIdForUser(job.id))?.status).toBe(finished.status);
  });
});
