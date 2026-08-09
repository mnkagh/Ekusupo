import { randomBytes } from "node:crypto";

import type { AuthSession, MusicProvider } from "@ekusupo/connector-sdk";
import type { Playlist } from "@ekusupo/upf";
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
    { track: { id: "t1", title: "Mr. Brightside", artists: [{ id: "a1", name: "The Killers" }] } },
  ],
};

/** Returns a fake `authenticate` (used by /providers/spotify/callback) and a fake `getPlaylist` (used by /transfers/dry-run) on the same provider. */
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

beforeEach(() => {
  process.env.PROVIDER_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("hex");
});

afterEach(() => {
  process.env.PROVIDER_TOKEN_ENCRYPTION_KEY = originalKey;
});

describe("POST /transfers/dry-run", () => {
  it("requires authentication", async () => {
    app = await buildServer();
    const response = await app.inject({
      method: "POST",
      url: "/transfers/dry-run",
      payload: { sourcePlaylistId: "playlist-1" },
    });
    expect(response.statusCode).toBe(401);
  });

  it("requires a sourcePlaylistId", async () => {
    app = await buildServer();
    const sessionCookie = await signUpAndGetCookie();

    const response = await app.inject({
      method: "POST",
      url: "/transfers/dry-run",
      payload: {},
      cookies: { ekusupo_session: sessionCookie },
    });
    expect(response.statusCode).toBe(400);
  });

  it("rejects a sourcePlaylistId that isn't a usable string", async () => {
    app = await buildServer();
    const sessionCookie = await signUpAndGetCookie();

    // Rejected outright by the schema, before any route logic runs.
    // Note what is NOT in this list: `12345` and `["x"]`, which AJV
    // coerces to "12345" and "x" (see the next test). Coercion is fine —
    // the route still only ever sees a string — but it means asserting
    // on the status code alone would prove nothing here.
    for (const sourcePlaylistId of [{ id: "x" }, "", null]) {
      const response = await app.inject({
        method: "POST",
        url: "/transfers/dry-run",
        payload: { sourcePlaylistId },
        cookies: { ekusupo_session: sessionCookie },
      });
      expect(response.statusCode, `payload ${JSON.stringify(sourcePlaylistId)}`).toBe(400);
      expect(response.json().code, `payload ${JSON.stringify(sourcePlaylistId)}`).toBe(
        "FST_ERR_VALIDATION",
      );
    }
  });

  it("coerces a non-string sourcePlaylistId to a string rather than passing it on raw", async () => {
    app = await buildServer();
    const sessionCookie = await signUpAndGetCookie();

    // Fastify's AJV coerces to the declared type: 12345 becomes "12345"
    // and ["x"] becomes "x". That is the guarantee worth having — the
    // route body only ever sees a string, where before the schema a raw
    // number reached the provider. Reaching the "connect Spotify" check
    // is proof the value survived validation as a string; asserting the
    // status alone would pass for the wrong reason, since that response
    // is also a 400.
    for (const sourcePlaylistId of [12345, ["x"]]) {
      const response = await app.inject({
        method: "POST",
        url: "/transfers/dry-run",
        payload: { sourcePlaylistId },
        cookies: { ekusupo_session: sessionCookie },
      });
      expect(response.statusCode, `payload ${JSON.stringify(sourcePlaylistId)}`).toBe(400);
      expect(response.json(), `payload ${JSON.stringify(sourcePlaylistId)}`).toMatchObject({
        error: expect.stringContaining("Connect Spotify"),
      });
    }
  });

  it("returns a clear 400 when Spotify isn't connected yet", async () => {
    app = await buildServer();
    const sessionCookie = await signUpAndGetCookie();

    const response = await app.inject({
      method: "POST",
      url: "/transfers/dry-run",
      payload: { sourcePlaylistId: "playlist-1" },
      cookies: { ekusupo_session: sessionCookie },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: expect.stringContaining("Connect Spotify") });
  });

  it("runs a real Dry Run against a connected Spotify account and persists the report", async () => {
    app = await buildServer({
      providerRoutesConfig: spotifyConfig,
      createSpotifyProviderImpl: fakeSpotifyProviderImpl(),
      createTransferSpotifyProviderImpl: fakeSpotifyProviderImpl(),
    });
    const sessionCookie = await signUpAndGetCookie();
    await connectSpotify(sessionCookie);

    const response = await app.inject({
      method: "POST",
      url: "/transfers/dry-run",
      payload: { sourcePlaylistId: "playlist-1" },
      cookies: { ekusupo_session: sessionCookie },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.job.dryRun).toBe(true);
    expect(body.job.status).toBe("partial");
    expect(body.report.totalItems).toBe(1);
    // Spotify's real capabilities have no tracks.search, so used as both
    // source and destination it can plan but never match — same real
    // behavior packages/core/src/run-transfer.test.ts already proves.
    expect(body.report.skippedItems).toBe(1);

    const list = await app.inject({
      method: "GET",
      url: "/transfers",
      cookies: { ekusupo_session: sessionCookie },
    });
    expect(list.json().transfers).toHaveLength(1);
    expect(list.json().transfers[0]).toMatchObject({ id: body.job.id, status: "partial" });
    expect(list.json().transfers[0].report.totalItems).toBe(1);
  });

  it("reports a failed job with a reason (not a crash) when the source playlist can't be read", async () => {
    app = await buildServer({
      providerRoutesConfig: spotifyConfig,
      createSpotifyProviderImpl: fakeSpotifyProviderImpl(),
      createTransferSpotifyProviderImpl: fakeSpotifyProviderImpl(),
    });
    const sessionCookie = await signUpAndGetCookie();
    await connectSpotify(sessionCookie);

    const response = await app.inject({
      method: "POST",
      url: "/transfers/dry-run",
      payload: { sourcePlaylistId: "does-not-exist" },
      cookies: { ekusupo_session: sessionCookie },
    });

    // 200, not 502: the Dry Run itself ran fine — its *outcome* was a
    // failure, and `runDryRunTransfer` reports that rather than throwing
    // (packages/core/src/run-transfer.ts). The caller gets a report
    // explaining why, which an opaque 502 would have thrown away. The
    // route's 502 path still guards genuinely unexpected errors.
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.job.status).toBe("failed");
    expect(body.report.providerLimitationsEncountered).toEqual([
      "Could not read the source playlist: playlist not found",
    ]);
  });
});

describe("POST /transfers/dry-run — public playlists without connecting", () => {
  /** An app-level token: reads `public-1`, refuses anything else the way Spotify refuses a private playlist. */
  function fakeAppSpotify(): typeof import("@ekusupo/provider-spotify").createSpotifyProvider {
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
          ({ method: "oauth2", raw: { accessToken: "app-token" } }) as AuthSession,
        refreshAuthentication: async (s) => s,
        revokeAuthentication: async () => {},
        getPlaylist: async (_session, playlistId: string) => {
          if (playlistId !== "public-1") throw new Error("404 not found");
          return { ...fakePlaylist, id: "public-1" };
        },
      }) as MusicProvider;
  }

  const appSessionImpl = async () =>
    ({ method: "oauth2", raw: { accessToken: "app-token", appOnly: true } }) as AuthSession;

  it("transfers a public playlist with no Spotify account connected", async () => {
    app = await buildServer({
      providerRoutesConfig: spotifyConfig,
      createTransferSpotifyProviderImpl: fakeAppSpotify(),
      createSpotifyAppSessionImpl: appSessionImpl,
    });
    const sessionCookie = await signUpAndGetCookie();

    // Note: no connectSpotify() call anywhere in this test.
    const response = await app.inject({
      method: "POST",
      url: "/transfers/dry-run",
      payload: { sourcePlaylistId: "public-1" },
      cookies: { ekusupo_session: sessionCookie },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.usedConnectedAccount).toBe(false);
    expect(body.report.totalItems).toBe(1);
  });

  it("tells the user to connect when the playlist isn't public", async () => {
    app = await buildServer({
      providerRoutesConfig: spotifyConfig,
      createTransferSpotifyProviderImpl: fakeAppSpotify(),
      createSpotifyAppSessionImpl: appSessionImpl,
    });
    const sessionCookie = await signUpAndGetCookie();

    const response = await app.inject({
      method: "POST",
      url: "/transfers/dry-run",
      payload: { sourcePlaylistId: "someones-private-playlist" },
      cookies: { ekusupo_session: sessionCookie },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.job.status).toBe("failed");
    // The actionable half matters more than the technical reason: an
    // anonymous token cannot tell "private" from "missing", so the
    // message must not assert a wrong cause.
    expect(body.report.userActionsRequired).toContainEqual(
      expect.stringContaining("Connect your Spotify account"),
    );
  });

  it("prefers a connected account over the anonymous token", async () => {
    app = await buildServer({
      providerRoutesConfig: spotifyConfig,
      createSpotifyProviderImpl: fakeSpotifyProviderImpl(),
      createTransferSpotifyProviderImpl: fakeSpotifyProviderImpl(),
      createSpotifyAppSessionImpl: appSessionImpl,
    });
    const sessionCookie = await signUpAndGetCookie();
    await connectSpotify(sessionCookie);

    const response = await app.inject({
      method: "POST",
      url: "/transfers/dry-run",
      payload: { sourcePlaylistId: "playlist-1" },
      cookies: { ekusupo_session: sessionCookie },
    });

    expect(response.json().usedConnectedAccount).toBe(true);
  });

  it("still refuses when the server has no Spotify credentials at all", async () => {
    app = await buildServer({ createSpotifyAppSessionImpl: appSessionImpl });
    const sessionCookie = await signUpAndGetCookie();

    const response = await app.inject({
      method: "POST",
      url: "/transfers/dry-run",
      payload: { sourcePlaylistId: "public-1" },
      cookies: { ekusupo_session: sessionCookie },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toContain("Connect Spotify");
  });
});

describe("GET /transfers and GET /transfers/:id", () => {
  it("both require authentication", async () => {
    app = await buildServer();
    const list = await app.inject({ method: "GET", url: "/transfers" });
    expect(list.statusCode).toBe(401);

    const one = await app.inject({ method: "GET", url: "/transfers/transfer-1" });
    expect(one.statusCode).toBe(401);
  });

  it("returns an empty list before any transfer has run", async () => {
    app = await buildServer();
    const sessionCookie = await signUpAndGetCookie();

    const response = await app.inject({
      method: "GET",
      url: "/transfers",
      cookies: { ekusupo_session: sessionCookie },
    });
    expect(response.json()).toEqual({ transfers: [] });
  });

  it("404s for a transfer id that doesn't exist or belongs to another user", async () => {
    app = await buildServer();
    const sessionCookie = await signUpAndGetCookie();

    const response = await app.inject({
      method: "GET",
      url: "/transfers/does-not-exist",
      cookies: { ekusupo_session: sessionCookie },
    });
    expect(response.statusCode).toBe(404);
  });

  it("one user can't read a second user's transfer by id", async () => {
    app = await buildServer({
      providerRoutesConfig: spotifyConfig,
      createSpotifyProviderImpl: fakeSpotifyProviderImpl(),
      createTransferSpotifyProviderImpl: fakeSpotifyProviderImpl(),
    });
    const ownerCookie = await signUpAndGetCookie();
    await connectSpotify(ownerCookie);
    const runResponse = await app.inject({
      method: "POST",
      url: "/transfers/dry-run",
      payload: { sourcePlaylistId: "playlist-1" },
      cookies: { ekusupo_session: ownerCookie },
    });
    const jobId = runResponse.json().job.id as string;

    const otherCookie = await signUpAndGetCookie();
    const response = await app.inject({
      method: "GET",
      url: `/transfers/${jobId}`,
      cookies: { ekusupo_session: otherCookie },
    });
    expect(response.statusCode).toBe(404);
  });
});
