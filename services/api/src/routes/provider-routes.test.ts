import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { AuthSession, MusicProvider } from "@ekusupo/connector-sdk";

import { buildServer } from "../server.js";

let app: FastifyInstance;
const originalKey = process.env.PROVIDER_TOKEN_ENCRYPTION_KEY;

const spotifyConfig = {
  spotifyClientId: "test-client-id",
  spotifyClientSecret: "test-client-secret",
  spotifyRedirectUri: "http://localhost:3000/providers/spotify/callback",
  webAppUrl: "http://localhost:5173",
};

function fakeSpotifyProvider(
  session: AuthSession | Error,
): typeof import("@ekusupo/provider-spotify").createSpotifyProvider {
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
      authenticate: async () => {
        if (session instanceof Error) throw session;
        return session;
      },
      refreshAuthentication: async (s) => s,
      revokeAuthentication: async () => {},
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
  const cookie = response.cookies.find((c) => c.name === "ekusupo_session")?.value ?? "";
  return cookie;
}

beforeEach(() => {
  process.env.PROVIDER_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("hex");
});

afterEach(async () => {
  process.env.PROVIDER_TOKEN_ENCRYPTION_KEY = originalKey;
  // See server.test.ts — the server owns the pglite instance it opened.
  await app?.close();
});

describe("GET /providers", () => {
  it("requires authentication", async () => {
    app = await buildServer();
    const response = await app.inject({ method: "GET", url: "/providers" });
    expect(response.statusCode).toBe(401);
  });

  it("returns an empty list for a signed-in user with nothing connected", async () => {
    app = await buildServer();
    const sessionCookie = await signUpAndGetCookie();

    const response = await app.inject({
      method: "GET",
      url: "/providers",
      cookies: { ekusupo_session: sessionCookie },
    });

    expect(response.json()).toEqual({ providers: [] });
  });
});

describe("GET /providers/spotify/connect", () => {
  it("requires authentication", async () => {
    app = await buildServer({ providerRoutesConfig: spotifyConfig });
    const response = await app.inject({ method: "GET", url: "/providers/spotify/connect" });
    expect(response.statusCode).toBe(401);
  });

  it("returns 400 when Spotify isn't configured, instead of redirecting to a broken URL", async () => {
    app = await buildServer();
    const sessionCookie = await signUpAndGetCookie();

    const response = await app.inject({
      method: "GET",
      url: "/providers/spotify/connect",
      cookies: { ekusupo_session: sessionCookie },
    });

    expect(response.statusCode).toBe(400);
  });

  it("redirects to Spotify's real authorize URL and sets a state cookie, when configured", async () => {
    app = await buildServer({ providerRoutesConfig: spotifyConfig });
    const sessionCookie = await signUpAndGetCookie();

    const response = await app.inject({
      method: "GET",
      url: "/providers/spotify/connect",
      cookies: { ekusupo_session: sessionCookie },
    });

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toContain("accounts.spotify.com/authorize");
    expect(response.cookies.some((c) => c.name === "ekusupo_oauth_state")).toBe(true);
  });
});

describe("GET /providers/spotify/callback", () => {
  it("requires authentication", async () => {
    app = await buildServer({ providerRoutesConfig: spotifyConfig });
    const response = await app.inject({
      method: "GET",
      url: "/providers/spotify/callback?code=x&state=y",
    });
    expect(response.statusCode).toBe(401);
  });

  it("rejects a state that doesn't match the cookie (CSRF check)", async () => {
    app = await buildServer({ providerRoutesConfig: spotifyConfig });
    const sessionCookie = await signUpAndGetCookie();

    const response = await app.inject({
      method: "GET",
      url: "/providers/spotify/callback?code=abc&state=wrong-state",
      cookies: { ekusupo_session: sessionCookie, ekusupo_oauth_state: "the-real-state" },
    });

    expect(response.statusCode).toBe(400);
  });

  it("redirects to the web app with an error when Spotify reports one", async () => {
    app = await buildServer({ providerRoutesConfig: spotifyConfig });
    const sessionCookie = await signUpAndGetCookie();

    const response = await app.inject({
      method: "GET",
      url: "/providers/spotify/callback?error=access_denied",
      cookies: { ekusupo_session: sessionCookie },
    });

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toContain("provider_error=access_denied");
  });

  it("on a real successful exchange: saves the session and shows up in GET /providers", async () => {
    const fakeSession: AuthSession = { method: "oauth2", raw: { accessToken: "fake-token" } };
    app = await buildServer({
      providerRoutesConfig: spotifyConfig,
      createSpotifyProviderImpl: fakeSpotifyProvider(fakeSession),
    });
    const sessionCookie = await signUpAndGetCookie();

    const connect = await app.inject({
      method: "GET",
      url: "/providers/spotify/connect",
      cookies: { ekusupo_session: sessionCookie },
    });
    const state = connect.cookies.find((c) => c.name === "ekusupo_oauth_state")?.value ?? "";

    const callback = await app.inject({
      method: "GET",
      url: `/providers/spotify/callback?code=real-code&state=${state}`,
      cookies: { ekusupo_session: sessionCookie, ekusupo_oauth_state: state },
    });
    expect(callback.statusCode).toBe(302);
    expect(callback.headers.location).toContain("connected=spotify");

    const list = await app.inject({
      method: "GET",
      url: "/providers",
      cookies: { ekusupo_session: sessionCookie },
    });
    expect(list.json()).toEqual({
      providers: [{ provider: "spotify", connectedAt: expect.any(String) }],
    });
  });

  it("redirects with an error, without crashing, when the exchange itself fails", async () => {
    app = await buildServer({
      providerRoutesConfig: spotifyConfig,
      createSpotifyProviderImpl: fakeSpotifyProvider(new Error("invalid_grant")),
    });
    const sessionCookie = await signUpAndGetCookie();

    const connect = await app.inject({
      method: "GET",
      url: "/providers/spotify/connect",
      cookies: { ekusupo_session: sessionCookie },
    });
    const state = connect.cookies.find((c) => c.name === "ekusupo_oauth_state")?.value ?? "";

    const callback = await app.inject({
      method: "GET",
      url: `/providers/spotify/callback?code=bad-code&state=${state}`,
      cookies: { ekusupo_session: sessionCookie, ekusupo_oauth_state: state },
    });

    expect(callback.statusCode).toBe(302);
    expect(callback.headers.location).toContain("provider_error=exchange_failed");
  });

  it("distinguishes a storage failure from an exchange failure", async () => {
    // Spotify authorizes fine; the server just has no encryption key.
    // Reporting this as `exchange_failed` would send the operator to
    // re-check credentials that were never the problem.
    delete process.env.PROVIDER_TOKEN_ENCRYPTION_KEY;
    app = await buildServer({
      providerRoutesConfig: spotifyConfig,
      createSpotifyProviderImpl: fakeSpotifyProvider({
        method: "oauth2",
        raw: { accessToken: "token-that-cannot-be-stored" },
      } as AuthSession),
    });
    const sessionCookie = await signUpAndGetCookie();

    const connect = await app.inject({
      method: "GET",
      url: "/providers/spotify/connect",
      cookies: { ekusupo_session: sessionCookie },
    });
    const state = connect.cookies.find((c) => c.name === "ekusupo_oauth_state")?.value ?? "";

    const callback = await app.inject({
      method: "GET",
      url: `/providers/spotify/callback?code=good-code&state=${state}`,
      cookies: { ekusupo_session: sessionCookie, ekusupo_oauth_state: state },
    });

    expect(callback.statusCode).toBe(302);
    expect(callback.headers.location).toContain("provider_error=storage_failed");
    expect(callback.headers.location).not.toContain("exchange_failed");
  });
});

describe("DELETE /providers/:provider", () => {
  it("requires authentication", async () => {
    app = await buildServer();
    const response = await app.inject({ method: "DELETE", url: "/providers/spotify" });
    expect(response.statusCode).toBe(401);
  });

  it("disconnects a connected provider", async () => {
    const fakeSession: AuthSession = { method: "oauth2", raw: { accessToken: "fake-token" } };
    app = await buildServer({
      providerRoutesConfig: spotifyConfig,
      createSpotifyProviderImpl: fakeSpotifyProvider(fakeSession),
    });
    const sessionCookie = await signUpAndGetCookie();

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

    const deleteResponse = await app.inject({
      method: "DELETE",
      url: "/providers/spotify",
      cookies: { ekusupo_session: sessionCookie },
    });
    expect(deleteResponse.json()).toEqual({ disconnected: true });

    const list = await app.inject({
      method: "GET",
      url: "/providers",
      cookies: { ekusupo_session: sessionCookie },
    });
    expect(list.json()).toEqual({ providers: [] });
  });
});
