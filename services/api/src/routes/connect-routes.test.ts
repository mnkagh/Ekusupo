import { randomBytes } from "node:crypto";

import type { AuthSession } from "@ekusupo/connector-sdk";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildServer } from "../server.js";

let app: FastifyInstance;
const originalKey = process.env.PROVIDER_TOKEN_ENCRYPTION_KEY;

const credentials = {
  spotify: {
    clientId: "spotify-id",
    clientSecret: "spotify-secret",
    redirectUri: "http://127.0.0.1:3000/providers/spotify/callback",
  },
  "youtube-music": {
    clientId: "youtube-id",
    clientSecret: "youtube-secret",
    redirectUri: "http://127.0.0.1:3000/providers/youtube-music/callback",
  },
};

/** Replaces only the network-touching half of a definition. */
const exchangeOverrides = {
  spotify: {
    exchangeCode: async (): Promise<AuthSession> => ({
      method: "oauth2" as const,
      raw: { accessToken: "spotify-token" },
    }),
  },
  "youtube-music": {
    exchangeCode: async (): Promise<AuthSession> => ({
      method: "oauth2" as const,
      raw: { accessToken: "youtube-token", refreshToken: "youtube-refresh" },
    }),
  },
};

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

beforeEach(() => {
  process.env.PROVIDER_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("hex");
});

afterEach(async () => {
  process.env.PROVIDER_TOKEN_ENCRYPTION_KEY = originalKey;
  // See server.test.ts — the server owns the pglite instance it opened.
  await app?.close();
});

describe("GET /providers/catalog", () => {
  it("reports which providers the server is actually configured for", async () => {
    app = await buildServer({ providerCredentials: { spotify: credentials.spotify } });

    const response = await app.inject({ method: "GET", url: "/providers/catalog" });
    const byId = Object.fromEntries(
      (response.json().providers as { id: string; configured: boolean }[]).map((p) => [
        p.id,
        p.configured,
      ]),
    );

    // Honest per provider rather than a blanket claim: only Spotify has
    // credentials here, and the other must say so.
    expect(byId.spotify).toBe(true);
    expect(byId["youtube-music"]).toBe(false);
  });

  it("names the environment variables an operator is missing", async () => {
    app = await buildServer({ providerCredentials: {} });

    const providers = (await app.inject({ method: "GET", url: "/providers/catalog" })).json()
      .providers as { id: string; requiredEnv: string[] }[];

    expect(providers.find((p) => p.id === "youtube-music")?.requiredEnv).toContain(
      "YOUTUBE_CLIENT_ID",
    );
  });
});

describe("GET /providers/:provider/connect", () => {
  it("requires authentication", async () => {
    app = await buildServer({ providerCredentials: credentials });
    const response = await app.inject({ method: "GET", url: "/providers/youtube-music/connect" });
    expect(response.statusCode).toBe(401);
  });

  it("404s for a provider the registry doesn't know", async () => {
    app = await buildServer({ providerCredentials: credentials });
    const cookie = await signUpAndGetCookie();

    const response = await app.inject({
      method: "GET",
      url: "/providers/tidal/connect",
      cookies: { ekusupo_session: cookie },
    });
    expect(response.statusCode).toBe(404);
  });

  it("redirects to Google with offline access, so a refresh token is issued", async () => {
    app = await buildServer({ providerCredentials: credentials });
    const cookie = await signUpAndGetCookie();

    const response = await app.inject({
      method: "GET",
      url: "/providers/youtube-music/connect",
      cookies: { ekusupo_session: cookie },
    });

    expect(response.statusCode).toBe(302);
    const location = response.headers.location as string;
    expect(location).toContain("accounts.google.com");
    // Without both of these Google returns no refresh token on a
    // reconnect, leaving an access token that expires in an hour.
    expect(location).toContain("access_type=offline");
    expect(location).toContain("prompt=consent");
    expect(response.cookies.find((c) => c.name === "ekusupo_oauth_state")).toBeDefined();
  });

  it("requests the narrowest YouTube scope that permits the writes it performs", async () => {
    app = await buildServer({ providerCredentials: credentials });
    const cookie = await signUpAndGetCookie();

    const response = await app.inject({
      method: "GET",
      url: "/providers/youtube-music/connect",
      cookies: { ekusupo_session: cookie },
    });

    const location = response.headers.location as string;

    // Least privilege (CLAUDE.md §12.2). YouTube Music became a real
    // Live Transfer destination in ADR-0032, which is the condition
    // ADR-0029 set for widening this beyond `youtube.readonly`. Google
    // offers no playlist-only write scope, so `youtube` is the floor —
    // but the still-broader ones must stay unrequested.
    expect(decodeURIComponent(location)).toContain("https://www.googleapis.com/auth/youtube&");
    expect(location).not.toContain("youtube.force-ssl");
    expect(location).not.toContain("youtubepartner");
  });

  it("refuses with the missing variables named when a provider isn't configured", async () => {
    app = await buildServer({ providerCredentials: {} });
    const cookie = await signUpAndGetCookie();

    const response = await app.inject({
      method: "GET",
      url: "/providers/youtube-music/connect",
      cookies: { ekusupo_session: cookie },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toContain("YOUTUBE_CLIENT_ID");
  });
});

describe("GET /providers/:provider/callback", () => {
  it("stores the connection on a successful exchange", async () => {
    app = await buildServer({
      providerCredentials: credentials,
      providerOverrides: exchangeOverrides,
    });
    const cookie = await signUpAndGetCookie();

    const connect = await app.inject({
      method: "GET",
      url: "/providers/youtube-music/connect",
      cookies: { ekusupo_session: cookie },
    });
    const state = connect.cookies.find((c) => c.name === "ekusupo_oauth_state")?.value ?? "";

    const callback = await app.inject({
      method: "GET",
      url: `/providers/youtube-music/callback?code=good&state=${state}`,
      cookies: { ekusupo_session: cookie, ekusupo_oauth_state: state },
    });

    expect(callback.statusCode).toBe(302);
    expect(callback.headers.location).toContain("connected=youtube-music");

    const list = await app.inject({
      method: "GET",
      url: "/providers",
      cookies: { ekusupo_session: cookie },
    });
    expect(list.json().providers.map((p: { provider: string }) => p.provider)).toContain(
      "youtube-music",
    );
  });

  it("rejects a state that doesn't match the cookie (CSRF check)", async () => {
    app = await buildServer({
      providerCredentials: credentials,
      providerOverrides: exchangeOverrides,
    });
    const cookie = await signUpAndGetCookie();

    const response = await app.inject({
      method: "GET",
      url: "/providers/youtube-music/callback?code=good&state=attacker",
      cookies: { ekusupo_session: cookie, ekusupo_oauth_state: "real" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toContain("Invalid or expired OAuth state");
  });

  it("redirects with the provider's own error when the user declines", async () => {
    app = await buildServer({ providerCredentials: credentials });
    const cookie = await signUpAndGetCookie();

    const response = await app.inject({
      method: "GET",
      url: "/providers/youtube-music/callback?error=access_denied&state=x",
      cookies: { ekusupo_session: cookie },
    });

    expect(response.headers.location).toContain("provider_error=access_denied");
  });

  it("distinguishes a storage failure from an exchange failure", async () => {
    delete process.env.PROVIDER_TOKEN_ENCRYPTION_KEY;
    app = await buildServer({
      providerCredentials: credentials,
      providerOverrides: exchangeOverrides,
    });
    const cookie = await signUpAndGetCookie();

    const connect = await app.inject({
      method: "GET",
      url: "/providers/youtube-music/connect",
      cookies: { ekusupo_session: cookie },
    });
    const state = connect.cookies.find((c) => c.name === "ekusupo_oauth_state")?.value ?? "";

    const callback = await app.inject({
      method: "GET",
      url: `/providers/youtube-music/callback?code=good&state=${state}`,
      cookies: { ekusupo_session: cookie, ekusupo_oauth_state: state },
    });

    // The exchange succeeded; only storage failed. Reporting this as
    // exchange_failed would send the operator to re-check credentials
    // that were never the problem.
    expect(callback.headers.location).toContain("provider_error=storage_failed");
  });

  it("404s on the callback for a provider that is not in the registry", async () => {
    app = await buildServer({ providerCredentials: credentials });
    const cookie = await signUpAndGetCookie();

    const response = await app.inject({
      method: "GET",
      url: "/providers/not-a-provider/callback?code=x&state=y",
      cookies: { ekusupo_session: cookie },
    });

    expect(response.statusCode).toBe(404);
  });
});
