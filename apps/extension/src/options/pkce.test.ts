import { describe, expect, it } from "vitest";

import { buildAuthorizeUrl, computeCodeChallenge, generateCodeVerifier } from "./pkce.js";

describe("generateCodeVerifier", () => {
  it("generates a verifier within RFC 7636's 43-128 character range", () => {
    const verifier = generateCodeVerifier();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(verifier.length).toBeLessThanOrEqual(128);
    expect(verifier).toMatch(/^[A-Za-z0-9\-._~]+$/);
  });

  it("generates a different verifier every call", () => {
    expect(generateCodeVerifier()).not.toBe(generateCodeVerifier());
  });
});

describe("computeCodeChallenge", () => {
  it("computes a stable, URL-safe S256 challenge for a given verifier", async () => {
    // A fixed test vector so this doesn't depend on generateCodeVerifier's randomness.
    const challenge = await computeCodeChallenge("a".repeat(43));
    expect(challenge).not.toMatch(/[+/=]/);
    // Deterministic — the same verifier always produces the same challenge.
    await expect(computeCodeChallenge("a".repeat(43))).resolves.toBe(challenge);
  });

  it("produces different challenges for different verifiers", async () => {
    const a = await computeCodeChallenge("a".repeat(43));
    const b = await computeCodeChallenge("b".repeat(43));
    expect(a).not.toBe(b);
  });
});

describe("buildAuthorizeUrl", () => {
  it("builds Spotify's authorize URL with every required PKCE parameter", () => {
    const url = new URL(
      buildAuthorizeUrl({
        clientId: "my-client-id",
        redirectUri: "https://abc.chromiumapp.org/",
        codeChallenge: "the-challenge",
        scope: "playlist-read-private",
      }),
    );

    expect(url.origin + url.pathname).toBe("https://accounts.spotify.com/authorize");
    expect(url.searchParams.get("client_id")).toBe("my-client-id");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("redirect_uri")).toBe("https://abc.chromiumapp.org/");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toBe("the-challenge");
    expect(url.searchParams.get("scope")).toBe("playlist-read-private");
  });
});
