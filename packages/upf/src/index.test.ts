import { describe, expect, it } from "vitest";

import { UPF_FORMAT_NAME, UPF_FORMAT_VERSION } from "./document.js";
import type { UpfDocument } from "./index.js";

describe("UpfDocument", () => {
  it("composes Playlist -> PlaylistItem -> Track -> Album/Artist with provider refs and external ids", () => {
    const doc: UpfDocument = {
      format: UPF_FORMAT_NAME,
      version: UPF_FORMAT_VERSION,
      createdAt: "2026-07-22T00:00:00.000Z",
      source: {
        provider: "example-provider",
        exportedBy: "ekusupo-cli",
        exportedByVersion: "0.1.0",
      },
      playlists: [
        {
          id: "playlist-1",
          title: "Road Trip",
          items: [
            {
              addedAt: "2026-07-20T12:00:00.000Z",
              track: {
                id: "track-1",
                title: "Example Song",
                durationMs: 210_000,
                explicit: "clean",
                externalIds: { isrc: "USRC17607839" },
                providerRefs: {
                  "example-provider": { id: "abc123", url: "https://example.com/track/abc123" },
                },
                artists: [{ id: "artist-1", name: "Example Artist" }],
                album: {
                  id: "album-1",
                  title: "Example Album",
                  externalIds: { upc: "123456789012" },
                  artists: [{ id: "artist-1", name: "Example Artist" }],
                },
              },
            },
          ],
        },
      ],
    };

    expect(doc.format).toBe("upf");
    expect(doc.playlists).toHaveLength(1);

    const [playlist] = doc.playlists;
    expect(playlist?.items).toHaveLength(1);

    const track = playlist?.items[0]?.track;
    expect(track?.album?.title).toBe("Example Album");
    expect(track?.artists[0]?.name).toBe("Example Artist");
    expect(track?.externalIds?.isrc).toBe("USRC17607839");
    expect(track?.providerRefs?.["example-provider"]?.id).toBe("abc123");
  });
});
