import { describe, expect, it } from "vitest";

import { authenticate, refreshAuthentication } from "./auth.js";
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
});
