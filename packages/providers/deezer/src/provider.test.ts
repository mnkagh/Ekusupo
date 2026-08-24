import { ConnectorError } from "@ekusupo/connector-sdk";
import { describe, expect, it } from "vitest";

import { createDeezerProvider } from "./provider.js";

const session = { method: "none" as const, raw: {} };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function trackFixture(id: number, title: string) {
  return {
    id,
    title,
    duration: 200,
    isrc: `ISRC${id}`,
    artist: { id: 1, name: "Artist" },
    album: { id: 2, title: "Album", cover_big: "https://cdn/cover.jpg" },
  };
}

describe("createDeezerProvider", () => {
  it("exposes the read-only capability set", () => {
    const provider = createDeezerProvider();
    expect(provider.manifest.name).toBe("deezer");
    expect(provider.getCapabilities().supports.has("playlists.read")).toBe(true);
    expect(provider.getCapabilities().supports.has("tracks.search")).toBe(true);
    expect(provider.getCapabilities().supports.has("playlists.create")).toBe(false);
    expect(provider.createPlaylist).toBeUndefined();
    expect(provider.searchTracks).toBeDefined();
  });

  it("normalizes a public playlist to UPF with milliseconds and ISRCs", async () => {
    const fetchImpl = (async (input: string | URL | Request) => {
      const url = input.toString();
      // The follow-up URL contains the playlist id too, so it must be
      // matched first.
      if (url.includes("page=2")) {
        return jsonResponse({ data: [trackFixture(2, "Two")], total: 2, next: null });
      }
      if (url.includes("/playlist/908622995")) {
        return jsonResponse({
          id: 908622995,
          title: "Test list",
          public: true,
          tracks: {
            data: [trackFixture(1, "One")],
            total: 2,
            next: "https://api.deezer.com/playlist/908622995?page=2",
          },
        });
      }
      return jsonResponse({}, 404);
    }) as unknown as typeof fetch;

    const provider = createDeezerProvider({ fetchImpl });
    const playlist = await provider.getPlaylist?.(session, "908622995");

    expect(playlist?.title).toBe("Test list");
    expect(playlist?.privacy).toBe("public");
    expect(playlist?.items.map((item) => item.track.title)).toEqual(["One", "Two"]);
    expect(playlist?.items[0]?.track.durationMs).toBe(200_000);
    expect(playlist?.items[0]?.track.externalIds?.isrc).toBe("ISRC1");
    expect(playlist?.items[0]?.track.providerRefs?.deezer?.url).toContain("/track/1");
  });

  it("searches with the ISRC folded into Deezer's advanced syntax", async () => {
    let requested = "";
    const fetchImpl = (async (input: string | URL | Request) => {
      requested = input.toString();
      return jsonResponse({ data: [trackFixture(7, "Matched")] });
    }) as unknown as typeof fetch;

    const provider = createDeezerProvider({ fetchImpl });
    const page = await provider.searchTracks?.(session, { text: "", isrc: "USAT29900609" });

    expect(requested).toContain(encodeURIComponent("ISRC:USAT29900609"));
    expect(page?.items).toHaveLength(1);
    expect(page?.items[0]?.id).toBe("7");
  });

  it("translates a 200-with-error-body into a retryable connector error", async () => {
    const fetchImpl = (async () =>
      jsonResponse({
        error: { type: "QuotaException", message: "quota limit exceeded" },
      })) as unknown as typeof fetch;

    const provider = createDeezerProvider({ fetchImpl });

    await expect(provider.getPlaylist?.(session, "1")).rejects.toMatchObject({
      code: "provider_unavailable",
      retryable: true,
    });
  });

  it("maps a missing playlist to not_found", async () => {
    const fetchImpl = (async () => jsonResponse({}, 404)) as unknown as typeof fetch;
    const provider = createDeezerProvider({ fetchImpl });

    await expect(provider.getPlaylist?.(session, "missing")).rejects.toBeInstanceOf(ConnectorError);
    await expect(provider.getPlaylist?.(session, "missing")).rejects.toMatchObject({
      code: "not_found",
    });
  });
});
