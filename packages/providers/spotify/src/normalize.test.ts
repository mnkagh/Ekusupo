import { describe, expect, it } from "vitest";

import { normalizeArtist, normalizePlaylist, normalizeTrack } from "./normalize.js";
import type { SpotifyPlaylistObject, SpotifyTrackObject } from "./types.js";

const killersArtist = {
  id: "0C0XlULifJtAgn6ZNCW2eu",
  name: "The Killers",
  external_urls: { spotify: "https://open.spotify.com/artist/0C0XlULifJtAgn6ZNCW2eu" },
};

const mrBrightside: SpotifyTrackObject = {
  id: "003vvx7Niy0yvhvHt4a68B",
  name: "Mr. Brightside",
  duration_ms: 222075,
  explicit: false,
  track_number: 2,
  disc_number: 1,
  artists: [killersArtist],
  album: {
    id: "0dLBEsCyKcSKgrhtzZBLDN",
    name: "Hot Fuss",
    release_date: "2004-06-15",
    total_tracks: 11,
    images: [{ url: "https://example.com/hot-fuss.jpg", width: 640, height: 640 }],
    artists: [killersArtist],
    external_urls: { spotify: "https://open.spotify.com/album/0dLBEsCyKcSKgrhtzZBLDN" },
  },
  external_ids: { isrc: "USIR20400274" },
  external_urls: { spotify: "https://open.spotify.com/track/003vvx7Niy0yvhvHt4a68B" },
};

describe("normalizeArtist", () => {
  it("maps id, name, and a spotify provider ref, with no images (simplified object)", () => {
    const artist = normalizeArtist(killersArtist);
    expect(artist).toEqual({
      id: "0C0XlULifJtAgn6ZNCW2eu",
      name: "The Killers",
      providerRefs: {
        spotify: { id: "0C0XlULifJtAgn6ZNCW2eu", url: killersArtist.external_urls.spotify },
      },
    });
  });
});

describe("normalizeTrack", () => {
  it("maps a full Spotify track into a UPF Track", () => {
    const track = normalizeTrack(mrBrightside);

    expect(track.id).toBe("003vvx7Niy0yvhvHt4a68B");
    expect(track.title).toBe("Mr. Brightside");
    expect(track.durationMs).toBe(222075);
    expect(track.explicit).toBe("clean");
    expect(track.trackNumber).toBe(2);
    expect(track.externalIds?.isrc).toBe("USIR20400274");
    expect(track.artists[0]?.name).toBe("The Killers");
    expect(track.album?.title).toBe("Hot Fuss");
    expect(track.album?.releaseDate).toBe("2004-06-15");
    expect(track.album?.artwork?.[0]?.url).toBe("https://example.com/hot-fuss.jpg");
    expect(track.providerRefs?.spotify?.id).toBe("003vvx7Niy0yvhvHt4a68B");
    expect(track.providerRefs?.spotify?.raw).toEqual(mrBrightside);
  });

  it('maps explicit: true to the tri-state "explicit", never "unknown"', () => {
    const explicitTrack = normalizeTrack({ ...mrBrightside, explicit: true });
    expect(explicitTrack.explicit).toBe("explicit");
  });

  it("handles a track with no album (album is optional in UPF)", () => {
    const singleTrack = normalizeTrack({ ...mrBrightside, album: undefined });
    expect(singleTrack.album).toBeUndefined();
  });
});

describe("normalizePlaylist", () => {
  const basePlaylist: SpotifyPlaylistObject = {
    id: "37i9dQZF1DXcBWIGoYBM5M",
    name: "Today's Top Hits",
    description: "The hits.",
    public: true,
    snapshot_id: "abc123",
    images: [{ url: "https://example.com/cover.jpg", width: 300, height: 300 }],
    tracks: {
      total: 1,
      items: [
        { added_at: "2026-01-01T00:00:00.000Z", added_by: { id: "spotify" }, track: mrBrightside },
      ],
    },
    external_urls: { spotify: "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M" },
  };

  it("maps a fully-populated playlist (single-playlist endpoint shape)", () => {
    const playlist = normalizePlaylist(basePlaylist);

    expect(playlist.id).toBe("37i9dQZF1DXcBWIGoYBM5M");
    expect(playlist.title).toBe("Today's Top Hits");
    expect(playlist.privacy).toBe("public");
    expect(playlist.items).toHaveLength(1);
    expect(playlist.items[0]?.addedBy).toBe("spotify");
    expect(playlist.items[0]?.track.title).toBe("Mr. Brightside");
  });

  it("defaults items to [] when tracks.items is absent (list-endpoint shape)", () => {
    const listShaped: SpotifyPlaylistObject = { ...basePlaylist, tracks: { total: 1 } };
    const playlist = normalizePlaylist(listShaped);
    expect(playlist.items).toEqual([]);
  });

  it('maps public: false to "private" and null to "unknown"', () => {
    expect(normalizePlaylist({ ...basePlaylist, public: false }).privacy).toBe("private");
    expect(normalizePlaylist({ ...basePlaylist, public: null }).privacy).toBe("unknown");
  });
});
