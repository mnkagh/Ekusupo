import { describe, expect, it } from "vitest";

import { authenticate, authenticateAsApp, refreshAuthentication } from "./auth.js";
import type { SpotifyTokenResponse } from "./types.js";

const tokenFixture: SpotifyTokenResponse = {
  access_token: "mock-access-token",
  token_type: "Bearer",
  expires_in: 3600,
  refresh_token: "mock-refresh-token",
};

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function capturingFetch(): {
  fetchImpl: typeof fetch;
  calls: { headers: Headers; body: URLSearchParams }[];
} {
  const calls: { headers: Headers; body: URLSearchParams }[] = [];
  const fetchImpl = (async (_input: string | URL | Request, init?: RequestInit) => {
    calls.push({
      headers: new Headers(init?.headers),
      body: new URLSearchParams(init?.body as string),
    });
    return jsonResponse(tokenFixture);
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

describe("authenticate — confidential client (clientSecret configured)", () => {
  it("sends Basic auth and no client_id/code_verifier in the body — unchanged v0.1 behavior", async () => {
    const { fetchImpl, calls } = capturingFetch();

    await authenticate(
      { clientId: "id", clientSecret: "secret", fetchImpl },
      { method: "oauth2", raw: { code: "auth-code", redirectUri: "https://app.example.com/cb" } },
    );

    expect(calls[0]?.headers.get("Authorization")).toBe(`Basic ${btoa("id:secret")}`);
    expect(calls[0]?.body.get("client_id")).toBeNull();
    expect(calls[0]?.body.get("code_verifier")).toBeNull();
    expect(calls[0]?.body.get("code")).toBe("auth-code");
  });
});

describe("authenticateAsApp — Client Credentials, no user involved", () => {
  it("asks for the client_credentials grant with Basic auth and no user code", async () => {
    const { fetchImpl, calls } = capturingFetch();

    await authenticateAsApp({ clientId: "id", clientSecret: "secret", fetchImpl });

    expect(calls[0]?.body.get("grant_type")).toBe("client_credentials");
    expect(calls[0]?.headers.get("Authorization")).toBe(`Basic ${btoa("id:secret")}`);
    // No authorization code and no redirect: there is no user in this flow.
    expect(calls[0]?.body.get("code")).toBeNull();
    expect(calls[0]?.body.get("redirect_uri")).toBeNull();
  });

  it("marks the session appOnly, so a caller can explain a private-playlist failure correctly", async () => {
    const { fetchImpl } = capturingFetch();

    const session = await authenticateAsApp({ clientId: "id", clientSecret: "secret", fetchImpl });

    expect(session.raw.appOnly).toBe(true);
    expect(session.raw.accessToken).toBe("mock-access-token");
  });

  it("refuses without a client secret — the grant is for confidential clients only", async () => {
    const { fetchImpl } = capturingFetch();

    await expect(authenticateAsApp({ clientId: "id", fetchImpl })).rejects.toThrow(
      /clientId and a clientSecret/,
    );
  });
});

describe("authenticate — public client / PKCE (no clientSecret) — ADR-0019", () => {
  it("sends no Authorization header, and puts client_id + code_verifier in the body", async () => {
    const { fetchImpl, calls } = capturingFetch();

    await authenticate(
      { clientId: "public-client-id", fetchImpl },
      {
        method: "oauth2",
        raw: {
          code: "auth-code",
          redirectUri: "https://<ext-id>.chromiumapp.org/",
          codeVerifier: "the-verifier",
        },
      },
    );

    expect(calls[0]?.headers.has("Authorization")).toBe(false);
    expect(calls[0]?.body.get("client_id")).toBe("public-client-id");
    expect(calls[0]?.body.get("code_verifier")).toBe("the-verifier");
  });

  it("rejects with validation_error when codeVerifier is missing and there's no clientSecret", async () => {
    const { fetchImpl } = capturingFetch();

    await expect(
      authenticate(
        { clientId: "public-client-id", fetchImpl },
        { method: "oauth2", raw: { code: "auth-code", redirectUri: "https://cb" } },
      ),
    ).rejects.toMatchObject({ code: "validation_error" });
  });
});

describe("refreshAuthentication", () => {
  it("also uses PKCE-style client_id-in-body for a public client, no codeVerifier needed", async () => {
    const { fetchImpl, calls } = capturingFetch();

    await refreshAuthentication(
      { clientId: "public-client-id", fetchImpl },
      { method: "oauth2", raw: { refreshToken: "refresh-me" } },
    );

    expect(calls[0]?.headers.has("Authorization")).toBe(false);
    expect(calls[0]?.body.get("client_id")).toBe("public-client-id");
    expect(calls[0]?.body.get("grant_type")).toBe("refresh_token");
  });

  it("still throws when the session has no refresh token, regardless of client type", async () => {
    const { fetchImpl } = capturingFetch();

    await expect(
      refreshAuthentication({ fetchImpl }, { method: "oauth2", raw: {} }),
    ).rejects.toMatchObject({ code: "authentication_error" });
  });

  it("keeps the old refresh token when the response omits one — RFC 6749 §6", async () => {
    // Spotify omits refresh_token on confidential-client refreshes. The
    // token just used is still valid; returning a session without one
    // used to make the *next* refresh fail with "no refresh token".
    const fetchWithoutRotation = (async () =>
      jsonResponse({
        access_token: "new-access-token",
        token_type: "Bearer",
        expires_in: 3600,
      })) as unknown as typeof fetch;

    const refreshed = await refreshAuthentication(
      { clientId: "id", clientSecret: "secret", fetchImpl: fetchWithoutRotation },
      { method: "oauth2", raw: { refreshToken: "still-valid-refresh" } },
    );

    expect(refreshed.raw.accessToken).toBe("new-access-token");
    expect(refreshed.raw.refreshToken).toBe("still-valid-refresh");
  });

  it("prefers a rotated refresh token when the response does include one", async () => {
    const { fetchImpl } = capturingFetch();

    const refreshed = await refreshAuthentication(
      { clientId: "id", clientSecret: "secret", fetchImpl },
      { method: "oauth2", raw: { refreshToken: "old-refresh" } },
    );

    expect(refreshed.raw.refreshToken).toBe("mock-refresh-token");
  });
});

describe("token response validation", () => {
  it("rejects a malformed 200 as a connector error instead of crashing on NaN dates", async () => {
    // A proxy or captive portal can answer 200 with HTML. `expires_in`
    // undefined used to reach `new Date(NaN).toISOString()` and throw an
    // unclassified RangeError.
    const htmlFetch = (async () =>
      new Response("<html>please sign in to the wifi</html>", {
        status: 200,
        headers: { "Content-Type": "text/html" },
      })) as unknown as typeof fetch;

    await expect(
      authenticateAsApp({ clientId: "id", clientSecret: "secret", fetchImpl: htmlFetch }),
    ).rejects.toMatchObject({ code: "provider_unavailable" });
  });
});
