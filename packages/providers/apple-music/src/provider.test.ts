import { ConnectorError } from "@ekusupo/connector-sdk";
import type { AuthSession } from "@ekusupo/connector-sdk";
import { describe, expect, it } from "vitest";

import { createAppleMusicProvider } from "./provider.js";

const session: AuthSession = {
  method: "oauth2",
  raw: { developerToken: "dev-token", musicUserToken: "user-token" },
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Records every URL requested, so tests can assert which endpoint was chosen. */
function recordingFetch(handler: (url: string) => Response): {
  fetchImpl: typeof fetch;
  urls: string[];
  headers: Headers[];
} {
  const urls: string[] = [];
  const headers: Headers[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    urls.push(String(input));
    headers.push(new Headers(init?.headers));
    return handler(String(input));
  }) as unknown as typeof fetch;
  return { fetchImpl, urls, headers };
}

const songFixture = {
  id: "1440857781",
  type: "songs",
  attributes: {
    name: "Mr. Brightside",
    artistName: "The Killers",
    albumName: "Hot Fuss",
    durationInMillis: 222075,
    isrc: "USIR20400274",
    contentRating: "clean",
    artwork: { url: "https://example.com/{w}x{h}.jpg" },
  },
};

describe("createAppleMusicProvider — capabilities", () => {
  it("declares tracks.search, which is what makes it usable as a destination", () => {
    const provider = createAppleMusicProvider();
    const supports = provider.getCapabilities().supports;

    expect(supports.has("playlists.read")).toBe(true);
    expect(supports.has("tracks.search")).toBe(true);
    // Writing isn't implemented, so it must not be claimed — the absence
    // of the method is the capability signal (ADR-0004).
    expect(supports.has("playlists.create")).toBe(false);
    expect(provider.createPlaylist).toBeUndefined();
    expect(provider.addTracksToPlaylist).toBeUndefined();
  });
});

describe("authenticate", () => {
  it("accepts a developer token and carries it onto the session", async () => {
    const provider = createAppleMusicProvider();

    const result = await provider.authenticate({
      method: "oauth2",
      raw: { developerToken: "dev-token", musicUserToken: "user-token" },
    });

    expect(result.raw.developerToken).toBe("dev-token");
    expect(result.raw.musicUserToken).toBe("user-token");
  });

  it("works without a user token — catalogue reads don't need a listener", async () => {
    const provider = createAppleMusicProvider({ developerToken: "from-config" });

    const result = await provider.authenticate({ method: "oauth2", raw: {} });

    expect(result.raw.developerToken).toBe("from-config");
    expect(result.raw.musicUserToken).toBeUndefined();
  });

  it("refuses without a developer token rather than failing later on the first request", async () => {
    const provider = createAppleMusicProvider();

    await expect(provider.authenticate({ method: "oauth2", raw: {} })).rejects.toThrow(
      /developer token/i,
    );
  });
});

describe("getPlaylist", () => {
  it("normalizes an Apple playlist into UPF", async () => {
    const { fetchImpl, headers } = recordingFetch(() =>
      jsonResponse({
        data: [
          {
            id: "pl.abc",
            type: "playlists",
            attributes: {
              name: "Road Trip",
              description: { standard: "Long drives" },
              isPublic: true,
              artwork: { url: "https://example.com/{w}x{h}.jpg" },
            },
            relationships: { tracks: { data: [songFixture] } },
          },
        ],
      }),
    );
    const provider = createAppleMusicProvider({ fetchImpl });

    const playlist = await provider.getPlaylist!(session, "pl.abc");

    expect(playlist.title).toBe("Road Trip");
    expect(playlist.description).toBe("Long drives");
    expect(playlist.privacy).toBe("public");
    expect(playlist.items).toHaveLength(1);
    expect(playlist.items[0]?.track.title).toBe("Mr. Brightside");
    expect(playlist.items[0]?.track.externalIds?.isrc).toBe("USIR20400274");

    // Both credentials must be on the wire — Apple rejects a request
    // carrying only one of them.
    expect(headers[0]?.get("Authorization")).toBe("Bearer dev-token");
    expect(headers[0]?.get("Music-User-Token")).toBe("user-token");
  });

  describe("playlists longer than one page", () => {
    /**
     * Apple returns at most 100 tracks with the playlist and puts the
     * rest behind `relationships.tracks.next`. Reading one page and
     * stopping loses everything past the hundredth *while still
     * reporting success*, so this is asserted rather than assumed.
     */
    function song(id: string, name: string) {
      return { ...songFixture, id, attributes: { ...songFixture.attributes, name } };
    }

    it("follows next until every track has been read", async () => {
      const { fetchImpl, urls } = recordingFetch((url) => {
        if (url.includes("offset=200")) {
          return jsonResponse({ data: [song("3", "Third")] });
        }
        if (url.includes("offset=100")) {
          return jsonResponse({
            data: [song("2", "Second")],
            next: "/v1/catalog/us/playlists/pl.abc/tracks?offset=200",
          });
        }
        return jsonResponse({
          data: [
            {
              id: "pl.abc",
              type: "playlists",
              attributes: { name: "Long one", isPublic: true },
              relationships: {
                tracks: {
                  data: [song("1", "First")],
                  next: "/v1/catalog/us/playlists/pl.abc/tracks?offset=100",
                },
              },
            },
          ],
        });
      });

      const provider = createAppleMusicProvider({ fetchImpl });
      const playlist = await provider.getPlaylist!(session, "pl.abc");

      expect(playlist.items.map((item) => item.track.title)).toEqual(["First", "Second", "Third"]);

      // The `/v1` prefix Apple puts on `next` must not be doubled onto a
      // base that already ends with it, or every follow-up 404s.
      expect(urls.slice(1).every((url) => !url.includes("/v1/v1/"))).toBe(true);
      expect(urls[1]).toBe(
        "https://api.music.apple.com/v1/catalog/us/playlists/pl.abc/tracks?offset=100",
      );
    });

    it("makes only one request when there is no next", async () => {
      const { fetchImpl, urls } = recordingFetch(() =>
        jsonResponse({
          data: [
            {
              id: "pl.abc",
              type: "playlists",
              attributes: { name: "Short one", isPublic: true },
              relationships: { tracks: { data: [song("1", "Only")] } },
            },
          ],
        }),
      );

      const provider = createAppleMusicProvider({ fetchImpl });
      const playlist = await provider.getPlaylist!(session, "pl.abc");

      expect(playlist.items).toHaveLength(1);
      expect(urls).toHaveLength(1);
    });

    it("stops rather than looping when a next page comes back empty", async () => {
      const { fetchImpl, urls } = recordingFetch((url) => {
        if (url.includes("offset")) {
          return jsonResponse({
            data: [],
            next: "/v1/catalog/us/playlists/pl.abc/tracks?offset=1",
          });
        }
        return jsonResponse({
          data: [
            {
              id: "pl.abc",
              type: "playlists",
              attributes: { name: "Odd one", isPublic: true },
              relationships: {
                tracks: {
                  data: [song("1", "Only")],
                  next: "/v1/catalog/us/playlists/pl.abc/tracks?offset=1",
                },
              },
            },
          ],
        });
      });

      const provider = createAppleMusicProvider({ fetchImpl });
      const playlist = await provider.getPlaylist!(session, "pl.abc");

      expect(playlist.items).toHaveLength(1);
      expect(urls).toHaveLength(2);
    });
  });

  it("resolves Apple's artwork template into a usable URL", async () => {
    const { fetchImpl } = recordingFetch(() =>
      jsonResponse({
        data: [
          {
            id: "pl.abc",
            type: "playlists",
            attributes: { name: "Art", artwork: { url: "https://example.com/{w}x{h}.jpg" } },
          },
        ],
      }),
    );
    const provider = createAppleMusicProvider({ fetchImpl });

    const playlist = await provider.getPlaylist!(session, "pl.abc");

    // Leaving {w}/{h} in place would export a URL that resolves to
    // nothing outside Apple's own clients.
    expect(playlist.artwork?.[0]?.url).toBe("https://example.com/600x600.jpg");
  });

  it("raises not_found rather than returning an empty playlist", async () => {
    const { fetchImpl } = recordingFetch(() => jsonResponse({ data: [] }));
    const provider = createAppleMusicProvider({ fetchImpl });

    await expect(provider.getPlaylist?.(session, "missing")).rejects.toBeInstanceOf(ConnectorError);
  });
});

describe("searchTracks", () => {
  it("prefers the exact ISRC endpoint over a text search", async () => {
    const { fetchImpl, urls } = recordingFetch((url) =>
      url.includes("filter%5Bisrc%5D") || url.includes("filter[isrc]")
        ? jsonResponse({ data: [songFixture] })
        : jsonResponse({ results: { songs: { data: [] } } }),
    );
    const provider = createAppleMusicProvider({ fetchImpl });

    const result = await provider.searchTracks?.(session, {
      text: "Mr. Brightside",
      isrc: "USIR20400274",
    });

    expect(result?.items).toHaveLength(1);
    // One call only: an exact identifier hit must not be followed by a
    // fuzzy text search (CLAUDE.md §10.2).
    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain("songs?filter");
  });

  it("falls back to text search when the ISRC finds nothing", async () => {
    const { fetchImpl, urls } = recordingFetch((url) =>
      url.includes("search")
        ? jsonResponse({ results: { songs: { data: [songFixture] } } })
        : jsonResponse({ data: [] }),
    );
    const provider = createAppleMusicProvider({ fetchImpl });

    const result = await provider.searchTracks?.(session, {
      text: "Mr. Brightside",
      isrc: "NOTFOUND0000",
    });

    expect(urls).toHaveLength(2);
    expect(result?.items[0]?.title).toBe("Mr. Brightside");
  });

  it("returns nothing, without calling the API, when there is nothing to search on", async () => {
    const { fetchImpl, urls } = recordingFetch(() => jsonResponse({}));
    const provider = createAppleMusicProvider({ fetchImpl });

    const result = await provider.searchTracks?.(session, { text: "" });

    expect(result?.items).toEqual([]);
    expect(urls).toHaveLength(0);
  });
});

describe("error mapping", () => {
  it("maps 403 to authorization_error, not authentication_error", async () => {
    const { fetchImpl } = recordingFetch(() => jsonResponse({}, 403));
    const provider = createAppleMusicProvider({ fetchImpl });

    // A missing Music-User-Token surfaces as 403. Reporting it as an
    // authentication failure would tell the user to sign in again, which
    // is not what fixes it.
    await expect(provider.getPlaylist?.(session, "pl.abc")).rejects.toMatchObject({
      code: "authorization_error",
    });
  });

  it("marks a 429 with the retry delay the engine backs off with", async () => {
    const fetchImpl = (async () =>
      new Response("{}", {
        status: 429,
        headers: { "Retry-After": "3" },
      })) as unknown as typeof fetch;
    const provider = createAppleMusicProvider({ fetchImpl });

    await expect(provider.getPlaylist?.(session, "pl.abc")).rejects.toMatchObject({
      code: "rate_limited",
      retryAfterMs: 3000,
    });
  });
});
