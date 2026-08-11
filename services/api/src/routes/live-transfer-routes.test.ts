import { randomBytes } from "node:crypto";

import type { AuthSession, MusicProvider } from "@ekusupo/connector-sdk";
import type { Playlist, UpfDocument } from "@ekusupo/upf";
import { UPF_FORMAT_NAME, UPF_FORMAT_VERSION } from "@ekusupo/upf";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildServer } from "../server.js";

let app: FastifyInstance;
const originalKey = process.env.PROVIDER_TOKEN_ENCRYPTION_KEY;

const spotifyConfig = {
  spotifyClientId: "test-client-id",
  spotifyClientSecret: "test-client-secret",
  spotifyRedirectUri: "http://localhost:3000/providers/spotify/callback",
  webAppUrl: "http://localhost:5173",
};

const fakePlaylist: Playlist = {
  id: "playlist-1",
  title: "Today's Top Hits",
  items: [
    {
      track: {
        id: "t1",
        title: "Mr. Brightside",
        artists: [{ id: "a1", name: "The Killers" }],
        durationMs: 222075,
      },
    },
    {
      track: {
        id: "t2",
        title: "Knights of Cydonia",
        artists: [{ id: "a2", name: "Muse" }],
        durationMs: 366213,
      },
    },
  ],
};

/** Read-only, exactly like the real Spotify connector — see packages/providers/spotify. */
function fakeSpotifyProviderImpl(): typeof import("@ekusupo/provider-spotify").createSpotifyProvider {
  return () =>
    ({
      manifest: {
        name: "spotify",
        displayName: "Spotify",
        version: "0.0.0",
        authenticationMethods: ["oauth2"],
        supportedCapabilities: new Set(["profile.read", "playlists.read"]),
      },
      getCapabilities: () => ({ supports: new Set(["profile.read", "playlists.read"]) }),
      authenticate: async () =>
        ({ method: "oauth2", raw: { accessToken: "fake-token" } }) as AuthSession,
      refreshAuthentication: async (s) => s,
      revokeAuthentication: async () => {},
      getPlaylist: async (_session, playlistId: string) => {
        if (playlistId !== fakePlaylist.id) throw new Error("playlist not found");
        return fakePlaylist;
      },
    }) as MusicProvider;
}

async function signUpAndGetCookie(): Promise<string> {
  const response = await app.inject({
    method: "POST",
    url: "/auth/sign-up",
    payload: {
      email: `user-${randomBytes(4).toString("hex")}@example.com`,
      password: "correct horse battery",
    },
  });
  return response.cookies.find((c) => c.name === "ekusupo_session")?.value ?? "";
}

async function connectSpotify(sessionCookie: string): Promise<void> {
  const connect = await app.inject({
    method: "GET",
    url: "/providers/spotify/connect",
    cookies: { ekusupo_session: sessionCookie },
  });
  const state = connect.cookies.find((c) => c.name === "ekusupo_oauth_state")?.value ?? "";
  await app.inject({
    method: "GET",
    url: `/providers/spotify/callback?code=real-code&state=${state}`,
    cookies: { ekusupo_session: sessionCookie, ekusupo_oauth_state: state },
  });
}

const TERMINAL = new Set(["completed", "partial", "failed", "cancelled"]);

/**
 * Transfers run in the background now (ADR-0033): a route answers 202
 * with a job id and the result arrives later. Polling is what a real
 * client does; there is no callback to await.
 */
async function waitForTransfer(sessionCookie: string, jobId: string) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const response = await app.inject({
      method: "GET",
      url: `/transfers/${jobId}`,
      cookies: { ekusupo_session: sessionCookie },
    });
    const transfer = response.json().transfer as Record<string, unknown>;
    if (TERMINAL.has(transfer.status as string)) return transfer;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Transfer ${jobId} never reached a terminal status.`);
}

async function runToCompletion(
  sessionCookie: string,
  url: string,
  payload: Record<string, unknown>,
) {
  const started = await app.inject({
    method: "POST",
    url,
    payload,
    cookies: { ekusupo_session: sessionCookie },
  });
  if (started.statusCode !== 202) return { started, transfer: undefined };
  const jobId = started.json().job.id as string;
  return { started, transfer: await waitForTransfer(sessionCookie, jobId) };
}

async function buildConnectedApp(): Promise<string> {
  app = await buildServer({
    providerRoutesConfig: spotifyConfig,
    createSpotifyProviderImpl: fakeSpotifyProviderImpl(),
    createTransferSpotifyProviderImpl: fakeSpotifyProviderImpl(),
  });
  const sessionCookie = await signUpAndGetCookie();
  await connectSpotify(sessionCookie);
  return sessionCookie;
}

beforeEach(() => {
  process.env.PROVIDER_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("hex");
});

afterEach(async () => {
  process.env.PROVIDER_TOKEN_ENCRYPTION_KEY = originalKey;
  // See server.test.ts — the server owns the pglite instance it opened.
  await app?.close();
});

describe("POST /transfers/live", () => {
  it("requires authentication", async () => {
    app = await buildServer();
    const response = await app.inject({
      method: "POST",
      url: "/transfers/live",
      payload: { sourcePlaylistId: "playlist-1", destinationProvider: "upf", confirm: true },
    });
    expect(response.statusCode).toBe(401);
  });

  it("refuses to write without an explicit confirmation", async () => {
    const sessionCookie = await buildConnectedApp();

    // The whole point: a client that copies the Dry Run request shape
    // must not accidentally trigger a real write (CLAUDE.md §9.3).
    for (const confirm of [undefined, false, "yes", 1]) {
      const response = await app.inject({
        method: "POST",
        url: "/transfers/live",
        payload: {
          sourcePlaylistId: "playlist-1",
          destinationProvider: "upf",
          ...(confirm === undefined ? {} : { confirm }),
        },
        cookies: { ekusupo_session: sessionCookie },
      });
      expect(response.statusCode, `confirm=${JSON.stringify(confirm)}`).toBe(400);
      expect(response.json().code, `confirm=${JSON.stringify(confirm)}`).toBe("FST_ERR_VALIDATION");
    }
  });

  it("really writes the source playlist into a downloadable UPF document", async () => {
    const sessionCookie = await buildConnectedApp();

    const { started, transfer } = await runToCompletion(sessionCookie, "/transfers/live", {
      sourcePlaylistId: "playlist-1",
      destinationProvider: "upf",
      confirm: true,
    });

    expect(started.statusCode).toBe(202);
    expect(started.json().job.dryRun).toBe(false);

    expect(transfer?.status).toBe("completed");
    const report = transfer?.report as { createdItems: number; matchedItems: number };
    expect(report.createdItems).toBe(2);
    // Write-through, not matching — a file has no catalogue (ADR-0018).
    expect(report.matchedItems).toBe(0);
    expect(transfer?.hasUpfDocument).toBe(true);

    const jobId = started.json().job.id as string;
    const download = await app.inject({
      method: "GET",
      url: `/transfers/${jobId}/upf`,
      cookies: { ekusupo_session: sessionCookie },
    });

    expect(download.statusCode).toBe(200);
    expect(download.headers["content-disposition"]).toContain(`${jobId}.upf.json`);

    const document = download.json() as UpfDocument;
    expect(document.format).toBe(UPF_FORMAT_NAME);
    expect(document.playlists).toHaveLength(1);
    expect(document.playlists[0]?.title).toBe("Today's Top Hits");
    // The real source tracks, not fabricated candidates.
    expect(document.playlists[0]?.items.map((item) => item.track.title)).toEqual([
      "Mr. Brightside",
      "Knights of Cydonia",
    ]);
  });

  it("names an unusable destination even when the source is not connected either", async () => {
    // A capability limitation is fixed; a missing connection is not. If
    // the source check came first, someone would connect an account and
    // then be refused anyway — two round trips for one form.
    app = await buildServer();
    const sessionCookie = await signUpAndGetCookie();

    const response = await app.inject({
      method: "POST",
      url: "/transfers/live",
      payload: { sourcePlaylistId: "playlist-1", destinationProvider: "spotify", confirm: true },
      cookies: { ekusupo_session: sessionCookie },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toMatch(/Spotify cannot be a Live Transfer destination/);
  });

  it("still reports a source problem when the destination is fine", async () => {
    app = await buildServer();
    const sessionCookie = await signUpAndGetCookie();

    const response = await app.inject({
      method: "POST",
      url: "/transfers/live",
      payload: { sourcePlaylistId: "playlist-1", destinationProvider: "upf", confirm: true },
      cookies: { ekusupo_session: sessionCookie },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toMatch(/Connect Spotify/);
  });

  it("refuses a destination that cannot be written to, before reading the source", async () => {
    const sessionCookie = await buildConnectedApp();

    // Spotify's connector is read-only. The error must name the provider
    // and offer the way out, not fail with a generic engine message.
    const response = await app.inject({
      method: "POST",
      url: "/transfers/live",
      payload: { sourcePlaylistId: "playlist-1", destinationProvider: "spotify", confirm: true },
      cookies: { ekusupo_session: sessionCookie },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toMatch(/Spotify cannot be a Live Transfer destination/);
    expect(response.json().error).toMatch(/UPF file/);

    // Nothing was recorded, because nothing ran.
    const list = await app.inject({
      method: "GET",
      url: "/transfers",
      cookies: { ekusupo_session: sessionCookie },
    });
    expect(list.json().transfers).toEqual([]);
  });

  it("rejects an unknown destination", async () => {
    const sessionCookie = await buildConnectedApp();

    const response = await app.inject({
      method: "POST",
      url: "/transfers/live",
      payload: { sourcePlaylistId: "playlist-1", destinationProvider: "napster", confirm: true },
      cookies: { ekusupo_session: sessionCookie },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toMatch(/Unknown destination provider "napster"/);
  });

  it("asks the user to connect a write-capable destination they have not connected", async () => {
    const sessionCookie = await buildConnectedApp();

    // YouTube Music declares playlists.create/addTracks, so it passes the
    // capability check and fails on the missing connection instead.
    const response = await app.inject({
      method: "POST",
      url: "/transfers/live",
      payload: {
        sourcePlaylistId: "playlist-1",
        destinationProvider: "youtube-music",
        confirm: true,
      },
      cookies: { ekusupo_session: sessionCookie },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toMatch(/Connect YouTube Music before transferring into it/);
  });

  it("records a failed job with a reason when the source cannot be read", async () => {
    const sessionCookie = await buildConnectedApp();

    const { started, transfer } = await runToCompletion(sessionCookie, "/transfers/live", {
      sourcePlaylistId: "does-not-exist",
      destinationProvider: "upf",
      confirm: true,
    });

    expect(started.statusCode).toBe(202);
    expect(transfer?.status).toBe("failed");
    // No document was produced, so none is offered.
    expect(transfer?.hasUpfDocument).toBe(false);
  });
});

describe("POST /transfers/:id/cancel", () => {
  it("requires authentication", async () => {
    app = await buildServer();
    const response = await app.inject({ method: "POST", url: "/transfers/anything/cancel" });
    expect(response.statusCode).toBe(401);
  });

  it("404s for a transfer that is not the caller's", async () => {
    const ownerCookie = await buildConnectedApp();
    const run = await app.inject({
      method: "POST",
      url: "/transfers/live",
      payload: { sourcePlaylistId: "playlist-1", destinationProvider: "upf", confirm: true },
      cookies: { ekusupo_session: ownerCookie },
    });
    const jobId = run.json().job.id as string;

    const otherCookie = await signUpAndGetCookie();
    const stolen = await app.inject({
      method: "POST",
      url: `/transfers/${jobId}/cancel`,
      cookies: { ekusupo_session: otherCookie },
    });
    expect(stolen.statusCode).toBe(404);

    await waitForTransfer(ownerCookie, jobId);
  });

  it("409s when the transfer already finished", async () => {
    const sessionCookie = await buildConnectedApp();
    const { started } = await runToCompletion(sessionCookie, "/transfers/live", {
      sourcePlaylistId: "playlist-1",
      destinationProvider: "upf",
      confirm: true,
    });

    // Not an error the caller can fix by retrying, and not a 404 either:
    // the transfer exists, it is just past the point of stopping.
    const response = await app.inject({
      method: "POST",
      url: `/transfers/${started.json().job.id as string}/cancel`,
      cookies: { ekusupo_session: sessionCookie },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().error).toMatch(/already completed/);
  });
});

describe("GET /transfers/:id/upf", () => {
  it("requires authentication", async () => {
    app = await buildServer();
    const response = await app.inject({ method: "GET", url: "/transfers/anything/upf" });
    expect(response.statusCode).toBe(401);
  });

  it("404s for a transfer with no export, and for another user's export", async () => {
    const ownerCookie = await buildConnectedApp();
    const run = await app.inject({
      method: "POST",
      url: "/transfers/live",
      payload: { sourcePlaylistId: "playlist-1", destinationProvider: "upf", confirm: true },
      cookies: { ekusupo_session: ownerCookie },
    });
    const jobId = run.json().job.id as string;
    await waitForTransfer(ownerCookie, jobId);

    const missing = await app.inject({
      method: "GET",
      url: "/transfers/never-existed/upf",
      cookies: { ekusupo_session: ownerCookie },
    });
    expect(missing.statusCode).toBe(404);

    // 404 rather than 403: another user's export is indistinguishable
    // from one that does not exist.
    const otherCookie = await signUpAndGetCookie();
    const stolen = await app.inject({
      method: "GET",
      url: `/transfers/${jobId}/upf`,
      cookies: { ekusupo_session: otherCookie },
    });
    expect(stolen.statusCode).toBe(404);
  });
});

describe("POST /transfers/import-upf", () => {
  function validDocument(): UpfDocument {
    return {
      format: UPF_FORMAT_NAME,
      version: UPF_FORMAT_VERSION,
      createdAt: "2026-01-01T00:00:00.000Z",
      playlists: [{ ...fakePlaylist, id: "imported-1", title: "From a backup" }],
    };
  }

  it("requires authentication and an explicit confirmation", async () => {
    app = await buildServer();
    const unauthenticated = await app.inject({
      method: "POST",
      url: "/transfers/import-upf",
      payload: { document: validDocument(), destinationProvider: "upf", confirm: true },
    });
    expect(unauthenticated.statusCode).toBe(401);

    const sessionCookie = await signUpAndGetCookie();
    const unconfirmed = await app.inject({
      method: "POST",
      url: "/transfers/import-upf",
      payload: { document: validDocument(), destinationProvider: "upf" },
      cookies: { ekusupo_session: sessionCookie },
    });
    expect(unconfirmed.statusCode).toBe(400);
  });

  it("names every problem in an invalid document instead of a bare rejection", async () => {
    app = await buildServer();
    const sessionCookie = await signUpAndGetCookie();

    const response = await app.inject({
      method: "POST",
      url: "/transfers/import-upf",
      payload: {
        document: { format: "upf", version: "0.1.0", createdAt: "nope", playlists: "no" },
        destinationProvider: "upf",
        confirm: true,
      },
      cookies: { ekusupo_session: sessionCookie },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.error).toMatch(/not a valid UPF document/);
    expect(body.problems.map((problem: { path: string }) => problem.path)).toEqual(
      expect.arrayContaining(["createdAt", "playlists"]),
    );
  });

  it("rejects a document with no playlists in it", async () => {
    app = await buildServer();
    const sessionCookie = await signUpAndGetCookie();

    const response = await app.inject({
      method: "POST",
      url: "/transfers/import-upf",
      payload: {
        document: { ...validDocument(), playlists: [] },
        destinationProvider: "upf",
        confirm: true,
      },
      cookies: { ekusupo_session: sessionCookie },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toMatch(/contains no playlists/);
  });

  it("imports an uploaded document and produces a transfer report for it", async () => {
    app = await buildServer();
    const sessionCookie = await signUpAndGetCookie();

    // Round-tripping into UPF is the honest end-to-end proof available
    // without a connected write-capable provider: a real engine run, a
    // real file connector on both ends, a real report.
    const { started, transfer } = await runToCompletion(sessionCookie, "/transfers/import-upf", {
      document: validDocument(),
      destinationProvider: "upf",
      confirm: true,
    });

    expect(started.statusCode).toBe(202);
    expect(transfer?.status).toBe("completed");
    expect(transfer?.sourceProvider).toBe("upf-file");
    const report = transfer?.report as { totalItems: number; createdItems: number };
    expect(report.totalItems).toBe(2);
    expect(report.createdItems).toBe(2);

    const download = await app.inject({
      method: "GET",
      url: `/transfers/${started.json().job.id as string}/upf`,
      cookies: { ekusupo_session: sessionCookie },
    });
    const document = download.json() as UpfDocument;
    expect(document.playlists[0]?.items.map((item) => item.track.title)).toEqual([
      "Mr. Brightside",
      "Knights of Cydonia",
    ]);
  });

  it("imports the requested playlist when the document holds several", async () => {
    app = await buildServer();
    const sessionCookie = await signUpAndGetCookie();

    const document: UpfDocument = {
      ...validDocument(),
      playlists: [
        { id: "first", title: "First", items: [] },
        { ...fakePlaylist, id: "second", title: "Second" },
      ],
    };

    const { started, transfer } = await runToCompletion(sessionCookie, "/transfers/import-upf", {
      document,
      destinationProvider: "upf",
      playlistId: "second",
      confirm: true,
    });

    expect(started.statusCode).toBe(202);
    expect((transfer?.report as { totalItems: number }).totalItems).toBe(2);

    const missing = await app.inject({
      method: "POST",
      url: "/transfers/import-upf",
      payload: { document, destinationProvider: "upf", playlistId: "third", confirm: true },
      cookies: { ekusupo_session: sessionCookie },
    });
    expect(missing.statusCode).toBe(400);
    expect(missing.json().error).toMatch(/no playlist "third"/);
  });
});

describe("POST /transfers/import-tracklist", () => {
  const PASTED = ["1. The Killers - Mr. Brightside", "2. Daft Punk - One More Time"].join("\n");

  it("requires authentication and an explicit confirmation", async () => {
    app = await buildServer();
    const unauthenticated = await app.inject({
      method: "POST",
      url: "/transfers/import-tracklist",
      payload: { text: PASTED, destinationProvider: "upf", confirm: true },
    });
    expect(unauthenticated.statusCode).toBe(401);

    const sessionCookie = await signUpAndGetCookie();
    const unconfirmed = await app.inject({
      method: "POST",
      url: "/transfers/import-tracklist",
      payload: { text: PASTED, destinationProvider: "upf" },
      cookies: { ekusupo_session: sessionCookie },
    });
    expect(unconfirmed.statusCode).toBe(400);
  });

  it("turns pasted text into a real transfer", async () => {
    app = await buildServer();
    const sessionCookie = await signUpAndGetCookie();

    const { started, transfer } = await runToCompletion(
      sessionCookie,
      "/transfers/import-tracklist",
      { text: PASTED, destinationProvider: "upf", title: "From my notes", confirm: true },
    );

    expect(started.statusCode).toBe(202);
    expect((transfer?.report as { totalItems: number }).totalItems).toBe(2);
  });

  it("returns the lines it could not read, rather than dropping them silently", async () => {
    // The transfer is genuinely missing those tracks, and the user is the
    // only one who can fix the text.
    app = await buildServer();
    const sessionCookie = await signUpAndGetCookie();

    const response = await app.inject({
      method: "POST",
      url: "/transfers/import-tracklist",
      payload: {
        text: "The Killers - Mr. Brightside\njust a title with no artist",
        destinationProvider: "upf",
        confirm: true,
      },
      cookies: { ekusupo_session: sessionCookie },
    });

    expect(response.statusCode).toBe(202);
    expect(response.json().skippedLines).toEqual([
      expect.objectContaining({ line: 2, reason: expect.stringContaining("No artist") }),
    ]);
  });

  it("explains itself when nothing in the text is a track", async () => {
    app = await buildServer();
    const sessionCookie = await signUpAndGetCookie();

    const response = await app.inject({
      method: "POST",
      url: "/transfers/import-tracklist",
      payload: { text: "?????\n!!!!!", destinationProvider: "upf", confirm: true },
      cookies: { ekusupo_session: sessionCookie },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toMatch(/Artist - Title/);
    expect(response.json().problems.length).toBeGreaterThan(0);
  });

  it("rejects an empty paste at the schema, before any work starts", async () => {
    app = await buildServer();
    const sessionCookie = await signUpAndGetCookie();

    const response = await app.inject({
      method: "POST",
      url: "/transfers/import-tracklist",
      payload: { text: "", destinationProvider: "upf", confirm: true },
      cookies: { ekusupo_session: sessionCookie },
    });

    expect(response.statusCode).toBe(400);
  });
});
