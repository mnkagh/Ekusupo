import { ConnectorError } from "@ekusupo/connector-sdk";
import { describe, expect, it, vi } from "vitest";

import { createSpotifyProvider } from "./provider.js";
import type { SpotifyPagedResponse, SpotifyPlaylistObject, SpotifyTokenResponse } from "./types.js";

const tokenFixture: SpotifyTokenResponse = {
  access_token: "mock-access-token",
  token_type: "Bearer",
  expires_in: 3600,
  refresh_token: "mock-refresh-token",
};

const profileFixture = { id: "wizzler", display_name: "Wizzler", email: "wizzler@example.com" };

const listItemFixture: SpotifyPlaylistObject = {
  id: "37i9dQZF1DXcBWIGoYBM5M",
  name: "Today's Top Hits",
  public: true,
  tracks: { total: 50 }, // list endpoint: no `items`
  external_urls: { spotify: "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M" },
};

const listFixture: SpotifyPagedResponse<SpotifyPlaylistObject> = {
  items: [listItemFixture],
  limit: 20,
  offset: 0,
  total: 1,
  next: null,
};

const singlePlaylistFixture: SpotifyPlaylistObject = {
  ...listItemFixture,
  tracks: {
    total: 1,
    items: [
      {
        added_at: "2026-01-01T00:00:00.000Z",
        added_by: { id: "spotify" },
        track: {
          id: "003vvx7Niy0yvhvHt4a68B",
          name: "Mr. Brightside",
          duration_ms: 222075,
          explicit: false,
          artists: [{ id: "0C0XlULifJtAgn6ZNCW2eu", name: "The Killers" }],
        },
      },
    ],
  },
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText: status === 200 ? "OK" : "Error",
    headers: { "Content-Type": "application/json" },
  });
}

function createMockFetch(overrides: { meStatus?: number } = {}) {
  return vi.fn(async (input: string | URL | Request) => {
    const url = input.toString();

    if (url.startsWith("https://accounts.spotify.com/api/token")) {
      return jsonResponse(tokenFixture);
    }
    if (url.endsWith("/me")) {
      return overrides.meStatus && overrides.meStatus !== 200
        ? jsonResponse({ error: "unauthorized" }, overrides.meStatus)
        : jsonResponse(profileFixture);
    }
    if (url.includes("/me/playlists")) {
      return jsonResponse(listFixture);
    }
    if (url.includes("/playlists/")) {
      return jsonResponse(singlePlaylistFixture);
    }
    return jsonResponse({ error: "not found" }, 404);
  }) as unknown as typeof fetch;
}

describe("createSpotifyProvider", () => {
  it("exposes its manifest and only read capabilities", () => {
    const provider = createSpotifyProvider();
    expect(provider.manifest.name).toBe("spotify");
    expect(provider.getCapabilities().supports.has("playlists.read")).toBe(true);
    expect(provider.getCapabilities().supports.has("playlists.create")).toBe(false);
  });

  it("implements no write methods at all — absence is the capability signal", () => {
    const provider = createSpotifyProvider();
    expect(provider.createPlaylist).toBeUndefined();
    expect(provider.updatePlaylist).toBeUndefined();
    expect(provider.deletePlaylist).toBeUndefined();
    expect(provider.addTracksToPlaylist).toBeUndefined();
    expect(provider.removeTracksFromPlaylist).toBeUndefined();
    expect(provider.searchTracks).toBeUndefined();
  });

  it("runs the auth lifecycle against a mocked token endpoint", async () => {
    const fetchImpl = createMockFetch();
    const provider = createSpotifyProvider({ fetchImpl, clientId: "id", clientSecret: "secret" });

    const session = await provider.authenticate({
      method: "oauth2",
      raw: { code: "auth-code", redirectUri: "https://app.example.com/callback" },
    });
    expect(session.raw.accessToken).toBe("mock-access-token");
    expect(session.expiresAt).toBeDefined();

    const refreshed = await provider.refreshAuthentication(session);
    expect(refreshed.raw.accessToken).toBe("mock-access-token");

    await expect(provider.revokeAuthentication(session)).resolves.toBeUndefined();
  });

  it("fetches and normalizes the profile", async () => {
    const fetchImpl = createMockFetch();
    const provider = createSpotifyProvider({ fetchImpl });
    const session = { method: "oauth2" as const, raw: { accessToken: "token" } };

    const profile = await provider.getProfile?.(session);
    expect(profile).toEqual({
      id: "wizzler",
      displayName: "Wizzler",
      email: "wizzler@example.com",
    });
  });

  it("lists playlists with empty items (list-endpoint shape) and normalizes to UPF", async () => {
    const fetchImpl = createMockFetch();
    const provider = createSpotifyProvider({ fetchImpl });
    const session = { method: "oauth2" as const, raw: { accessToken: "token" } };

    const page = await provider.listPlaylists?.(session);
    expect(page?.items).toHaveLength(1);
    expect(page?.items[0]?.title).toBe("Today's Top Hits");
    expect(page?.items[0]?.items).toEqual([]);
    expect(page?.nextCursor).toBeUndefined();
  });

  it("fetches a single playlist fully populated with UPF tracks", async () => {
    const fetchImpl = createMockFetch();
    const provider = createSpotifyProvider({ fetchImpl });
    const session = { method: "oauth2" as const, raw: { accessToken: "token" } };

    const playlist = await provider.getPlaylist?.(session, "37i9dQZF1DXcBWIGoYBM5M");
    expect(playlist?.items).toHaveLength(1);
    expect(playlist?.items[0]?.track.title).toBe("Mr. Brightside");
    expect(playlist?.items[0]?.track.artists[0]?.name).toBe("The Killers");
  });

  it("maps a 401 from the Spotify API into a ConnectorError", async () => {
    const fetchImpl = createMockFetch({ meStatus: 401 });
    const provider = createSpotifyProvider({ fetchImpl });
    const session = { method: "oauth2" as const, raw: { accessToken: "expired-token" } };

    await expect(provider.getProfile?.(session)).rejects.toMatchObject({
      code: "authentication_error",
    });
    await expect(provider.getProfile?.(session)).rejects.toBeInstanceOf(ConnectorError);
  });
});
