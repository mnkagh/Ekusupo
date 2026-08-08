import { describe, expect, it } from "vitest";

import { buildSpotifyAuthorizeUrl } from "./spotify-oauth.js";

describe("buildSpotifyAuthorizeUrl", () => {
  it("builds a classic Authorization Code URL with client_id, redirect_uri, and state", () => {
    const url = new URL(
      buildSpotifyAuthorizeUrl(
        {
          clientId: "my-client-id",
          redirectUri: "http://localhost:3000/providers/spotify/callback",
        },
        "the-csrf-state",
      ),
    );

    expect(url.origin + url.pathname).toBe("https://accounts.spotify.com/authorize");
    expect(url.searchParams.get("client_id")).toBe("my-client-id");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "http://localhost:3000/providers/spotify/callback",
    );
    expect(url.searchParams.get("state")).toBe("the-csrf-state");
    // Read-only scopes only — CLAUDE.md §12.2, matches what the reference
    // provider actually implements.
    expect(url.searchParams.get("scope")).not.toMatch(/playlist-modify/);
  });
});
