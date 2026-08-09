import type { AuthSession } from "@ekusupo/connector-sdk";
import { describe, expect, it } from "vitest";

import { parseVideoTitle } from "./normalize.js";
import { createYouTubeMusicProvider } from "./provider.js";

const session: AuthSession = { method: "oauth2", raw: { accessToken: "token" } };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function recordingFetch(handler: (url: string, init?: RequestInit) => Response): {
  fetchImpl: typeof fetch;
  calls: { url: string; method: string; body?: unknown }[];
} {
  const calls: { url: string; method: string; body?: unknown }[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(input),
      method: init?.method ?? "GET",
      body: init?.body ? JSON.parse(init.body as string) : undefined,
    });
    return handler(String(input), init);
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

describe("parseVideoTitle", () => {
  it("splits the conventional 'Artist - Title' video naming", () => {
    expect(parseVideoTitle("The Killers - Mr. Brightside")).toEqual({
      artist: "The Killers",
      title: "Mr. Brightside",
    });
  });

  it("strips the production noise YouTube titles carry", () => {
    expect(parseVideoTitle("MGMT - Time to Pretend (Official Video)")).toEqual({
      artist: "MGMT",
      title: "Time to Pretend",
    });
    expect(parseVideoTitle("MGMT - Kids [Official Audio] ")).toEqual({
      artist: "MGMT",
      title: "Kids",
    });
  });

  it("falls back to the channel, dropping YouTube's '- Topic' suffix", () => {
    expect(parseVideoTitle("Mr. Brightside", "The Killers - Topic")).toEqual({
      artist: "The Killers",
      title: "Mr. Brightside",
    });
  });

  it("splits on the first separator only, so titles keep their own dashes", () => {
    // "Title - Part 2" must not become artist "Artist - Title".
    expect(parseVideoTitle("Artist - Title - Part 2")).toEqual({
      artist: "Artist",
      title: "Title - Part 2",
    });
  });

  it("leaves a title alone when there is nothing reliable to split on", () => {
    expect(parseVideoTitle("Untitled")).toEqual({ artist: "", title: "Untitled" });
  });
});

describe("createYouTubeMusicProvider — capabilities", () => {
  it("declares the write capabilities that make it a real destination", () => {
    const provider = createYouTubeMusicProvider();
    const supports = provider.getCapabilities().supports;

    expect(supports.has("playlists.create")).toBe(true);
    expect(supports.has("playlists.addTracks")).toBe(true);
    expect(supports.has("tracks.search")).toBe(true);
    expect(provider.createPlaylist).toBeDefined();
    expect(provider.addTracksToPlaylist).toBeDefined();
  });
});

describe("getPlaylist", () => {
  it("follows pagination instead of silently truncating a long playlist", async () => {
    const { fetchImpl, calls } = recordingFetch((url) => {
      if (url.includes("/playlists?")) {
        return jsonResponse({
          items: [{ id: "PL1", snippet: { title: "Mix" }, status: { privacyStatus: "private" } }],
        });
      }
      if (url.includes("pageToken=page2")) {
        return jsonResponse({
          items: [
            {
              id: "i2",
              snippet: { title: "B - Two", resourceId: { kind: "youtube#video", videoId: "v2" } },
            },
          ],
        });
      }
      return jsonResponse({
        items: [
          {
            id: "i1",
            snippet: { title: "A - One", resourceId: { kind: "youtube#video", videoId: "v1" } },
          },
        ],
        nextPageToken: "page2",
      });
    });
    const provider = createYouTubeMusicProvider({ fetchImpl });

    const playlist = await provider.getPlaylist!(session, "PL1");

    expect(playlist.items).toHaveLength(2);
    expect(playlist.items[1]?.track.title).toBe("Two");
    expect(playlist.privacy).toBe("private");
    // metadata + two item pages
    expect(calls).toHaveLength(3);
  });

  it("reports unlisted as unknown rather than public", async () => {
    const { fetchImpl } = recordingFetch((url) =>
      url.includes("/playlists?")
        ? jsonResponse({
            items: [
              { id: "PL1", snippet: { title: "Mix" }, status: { privacyStatus: "unlisted" } },
            ],
          })
        : jsonResponse({ items: [] }),
    );
    const provider = createYouTubeMusicProvider({ fetchImpl });

    const playlist = await provider.getPlaylist!(session, "PL1");

    // Calling unlisted "public" would overstate how visible a
    // transferred playlist is.
    expect(playlist.privacy).toBe("unknown");
  });
});

describe("createPlaylist", () => {
  it("defaults to private, so a transfer never publishes by accident", async () => {
    const { fetchImpl, calls } = recordingFetch(() =>
      jsonResponse({ id: "PLnew", snippet: { title: "Imported" } }),
    );
    const provider = createYouTubeMusicProvider({ fetchImpl });

    await provider.createPlaylist!(session, { title: "Imported" });

    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.body).toMatchObject({ status: { privacyStatus: "private" } });
  });

  it("honours an explicit public request", async () => {
    const { fetchImpl, calls } = recordingFetch(() =>
      jsonResponse({ id: "PLnew", snippet: { title: "Shared" } }),
    );
    const provider = createYouTubeMusicProvider({ fetchImpl });

    await provider.createPlaylist!(session, { title: "Shared", privacy: "public" });

    expect(calls[0]?.body).toMatchObject({ status: { privacyStatus: "public" } });
  });
});

describe("addTracksToPlaylist", () => {
  it("inserts one item per track and re-reads the result", async () => {
    const { fetchImpl, calls } = recordingFetch((url) => {
      if (url.includes("/playlistItems?part=snippet") && url.includes("playlistId")) {
        return jsonResponse({ items: [] });
      }
      if (url.includes("/playlists?")) {
        return jsonResponse({ items: [{ id: "PL1", snippet: { title: "Mix" } }] });
      }
      return jsonResponse({ id: "inserted" });
    });
    const provider = createYouTubeMusicProvider({ fetchImpl });

    await provider.addTracksToPlaylist!(session, "PL1", [
      { id: "v1", title: "One", artists: [], explicit: "unknown" },
      { id: "v2", title: "Two", artists: [], explicit: "unknown" },
    ]);

    const inserts = calls.filter((call) => call.method === "POST");
    expect(inserts).toHaveLength(2);
    expect(inserts[0]?.body).toMatchObject({
      snippet: { playlistId: "PL1", resourceId: { videoId: "v1" } },
    });
  });

  it("skips a track with no video id instead of posting an invalid insert", async () => {
    const { fetchImpl, calls } = recordingFetch((url) =>
      url.includes("/playlists?")
        ? jsonResponse({ items: [{ id: "PL1", snippet: { title: "Mix" } }] })
        : jsonResponse({ items: [] }),
    );
    const provider = createYouTubeMusicProvider({ fetchImpl });

    await provider.addTracksToPlaylist!(session, "PL1", [
      { id: "", title: "Unmatched", artists: [], explicit: "unknown" },
    ]);

    expect(calls.filter((call) => call.method === "POST")).toHaveLength(0);
  });
});

describe("error mapping", () => {
  it("treats an exhausted quota as retryable rate limiting, not a permissions failure", async () => {
    const { fetchImpl } = recordingFetch(() =>
      jsonResponse({ error: { errors: [{ reason: "quotaExceeded" }] } }, 403),
    );
    const provider = createYouTubeMusicProvider({ fetchImpl });

    // Quota resets; a permissions denial does not. Collapsing the two
    // would make the engine abandon a transfer that would succeed later.
    await expect(provider.getPlaylist!(session, "PL1")).rejects.toMatchObject({
      code: "rate_limited",
      retryable: true,
    });
  });

  it("still reports a genuine 403 as an authorization failure", async () => {
    const { fetchImpl } = recordingFetch(() =>
      jsonResponse({ error: { errors: [{ reason: "forbidden" }] } }, 403),
    );
    const provider = createYouTubeMusicProvider({ fetchImpl });

    await expect(provider.getPlaylist!(session, "PL1")).rejects.toMatchObject({
      code: "authorization_error",
    });
  });
});
