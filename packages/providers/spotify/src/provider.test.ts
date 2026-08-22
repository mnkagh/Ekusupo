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

  it("skips entries whose track is null instead of crashing the whole read", async () => {
    // Spotify returns `track: null` for entries whose audio has left its
    // catalogue. Dereferencing it used to throw a TypeError and fail the
    // entire playlist read.
    const fetchImpl = (async (input: string | URL | Request) => {
      const url = input.toString();
      if (url.includes("/playlists/")) {
        return jsonResponse({
          id: "playlist-nulls",
          name: "Has dead entries",
          public: true,
          tracks: {
            total: 3,
            next: null,
            items: [
              {
                added_at: "2026-01-01T00:00:00.000Z",
                track: {
                  id: "alive-1",
                  name: "Alive",
                  duration_ms: 1000,
                  explicit: false,
                  artists: [{ id: "a", name: "A" }],
                },
              },
              { added_at: "2026-01-02T00:00:00.000Z", track: null },
              {
                added_at: "2026-01-03T00:00:00.000Z",
                track: {
                  id: "alive-2",
                  name: "Also alive",
                  duration_ms: 1000,
                  explicit: false,
                  artists: [{ id: "a", name: "A" }],
                },
              },
            ],
          },
        });
      }
      return jsonResponse({ error: "not found" }, 404);
    }) as unknown as typeof fetch;

    const provider = createSpotifyProvider({ fetchImpl });
    const session = { method: "oauth2" as const, raw: { accessToken: "token" } };

    const playlist = await provider.getPlaylist?.(session, "playlist-nulls");

    expect(playlist?.items.map((item) => item.track.id)).toEqual(["alive-1", "alive-2"]);
  });

  it("advances the playlist-list cursor by what the response actually held", async () => {
    // Spotify clamps `limit` to 50 on /me/playlists. Advancing by the
    // requested amount (100) would skip half the playlists on every page
    // after the first; advancing by the response's offset+count does not.
    let requested: URL | undefined;
    const fetchImpl = (async (input: string | URL | Request) => {
      const url = new URL(input.toString());
      if (url.pathname === "/api/token") return jsonResponse(tokenFixture);
      if (url.pathname.endsWith("/me/playlists")) {
        requested = url;
        return jsonResponse({
          items: Array.from({ length: 50 }, (_, index) => ({
            ...listItemFixture,
            id: `playlist-${index}`,
          })),
          limit: 50,
          offset: 0,
          total: 60,
          next: "https://api.spotify.com/v1/me/playlists?limit=50&offset=50",
        });
      }
      return jsonResponse({ error: "not found" }, 404);
    }) as unknown as typeof fetch;

    const provider = createSpotifyProvider({ fetchImpl, clientId: "id", clientSecret: "secret" });
    const session = { method: "oauth2" as const, raw: { accessToken: "token" } };

    const page = await provider.listPlaylists?.(session, { limit: 100 });

    expect(page?.items).toHaveLength(50);
    expect(page?.nextCursor).toBe("50");
    expect(requested?.searchParams.get("offset")).toBe("0");
  });

  it("treats an unparseable cursor as the first page rather than sending NaN", async () => {
    let requestedOffset: string | undefined;
    const fetchImpl = (async (input: string | URL | Request) => {
      const url = new URL(input.toString());
      if (url.pathname.endsWith("/me/playlists")) {
        requestedOffset = url.searchParams.get("offset") ?? undefined;
        return jsonResponse(listFixture);
      }
      return jsonResponse({ error: "not found" }, 404);
    }) as unknown as typeof fetch;

    const provider = createSpotifyProvider({ fetchImpl });
    const session = { method: "oauth2" as const, raw: { accessToken: "token" } };

    await provider.listPlaylists?.(session, { cursor: "not-a-number" });

    expect(requestedOffset).toBe("0");
  });

  describe("playlists longer than one page", () => {
    /**
     * Spotify caps `GET /playlists/{id}` at 100 tracks and puts the rest
     * behind `tracks.next`. Reading one page and stopping loses every
     * track past the hundredth *while still reporting success*, which is
     * why this is tested against page counts rather than trusted.
     */
    function pagedFetch(pages: string[][]): typeof fetch {
      const nextUrlFor = (index: number) =>
        index + 1 < pages.length ? `https://api.spotify.com/v1/next-page-${index + 1}` : null;

      const pageBody = (index: number) => ({
        items: (pages[index] ?? []).map((title, position) => ({
          added_at: "2026-01-01T00:00:00.000Z",
          track: {
            id: `track-${index}-${position}`,
            name: title,
            duration_ms: 200000,
            explicit: false,
            artists: [{ id: "artist-1", name: "Someone" }],
          },
        })),
        total: pages.flat().length,
        next: nextUrlFor(index),
      });

      return (async (input: string | URL | Request) => {
        const url = input.toString();
        const followed = /next-page-(\d+)/.exec(url);

        if (followed?.[1]) {
          return jsonResponse(pageBody(Number(followed[1])));
        }
        return jsonResponse({
          id: "playlist-1",
          name: "Long one",
          public: true,
          tracks: pageBody(0),
        });
      }) as unknown as typeof fetch;
    }

    const session = { method: "oauth2" as const, raw: { accessToken: "token" } };

    it("follows next until every track has been read", async () => {
      const provider = createSpotifyProvider({
        fetchImpl: pagedFetch([["A", "B"], ["C", "D"], ["E"]]),
      });

      const playlist = await provider.getPlaylist?.(session, "playlist-1");

      expect(playlist?.items.map((item) => item.track.title)).toEqual(["A", "B", "C", "D", "E"]);
    });

    it("keeps the pages in order", async () => {
      const provider = createSpotifyProvider({
        fetchImpl: pagedFetch([["first"], ["second"], ["third"]]),
      });

      const playlist = await provider.getPlaylist?.(session, "playlist-1");

      // Track order is playlist order — shuffling it during a transfer
      // would be a silent corruption of the thing being moved.
      expect(playlist?.items.map((item) => item.track.title)).toEqual(["first", "second", "third"]);
    });

    it("stops at a single page when there is no next", async () => {
      const fetchImpl = vi.fn(pagedFetch([["only"]]));
      const provider = createSpotifyProvider({ fetchImpl: fetchImpl as unknown as typeof fetch });

      const playlist = await provider.getPlaylist?.(session, "playlist-1");

      expect(playlist?.items).toHaveLength(1);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it("stops rather than looping when a next page comes back empty", async () => {
      // A `next` that yields nothing would otherwise spin to the page
      // cap, doing nothing but burning rate limit.
      const fetchImpl = vi.fn((async (input: string | URL | Request) => {
        const url = input.toString();
        if (url.includes("loop")) {
          return jsonResponse({ items: [], total: 2, next: "https://api.spotify.com/v1/loop" });
        }
        return jsonResponse({
          id: "playlist-1",
          name: "Odd one",
          public: true,
          tracks: {
            items: [
              {
                added_at: "2026-01-01T00:00:00.000Z",
                track: {
                  id: "t1",
                  name: "Only",
                  duration_ms: 1000,
                  explicit: false,
                  artists: [{ id: "a", name: "A" }],
                },
              },
            ],
            total: 2,
            next: "https://api.spotify.com/v1/loop",
          },
        });
      }) as unknown as typeof fetch);

      const provider = createSpotifyProvider({ fetchImpl: fetchImpl as unknown as typeof fetch });
      const playlist = await provider.getPlaylist?.(session, "playlist-1");

      expect(playlist?.items).toHaveLength(1);
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    });
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
