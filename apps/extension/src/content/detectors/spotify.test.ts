import { describe, expect, it } from "vitest";

import { spotifyDetector } from "./spotify.js";

describe("spotifyDetector", () => {
  describe("valid resource URLs", () => {
    it.each([
      [
        "bare playlist URL",
        "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M",
        { provider: "spotify", resourceType: "playlist", resourceId: "37i9dQZF1DXcBWIGoYBM5M" },
      ],
      [
        "http (not https)",
        "http://open.spotify.com/album/0dLBEsCyKcSKgrhtzZBLDN",
        { provider: "spotify", resourceType: "album", resourceId: "0dLBEsCyKcSKgrhtzZBLDN" },
      ],
      [
        "track URL",
        "https://open.spotify.com/track/003vvx7Niy0yvhvHt4a68B",
        { provider: "spotify", resourceType: "track", resourceId: "003vvx7Niy0yvhvHt4a68B" },
      ],
      [
        "with a query string",
        "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=abc123",
        { provider: "spotify", resourceType: "playlist", resourceId: "37i9dQZF1DXcBWIGoYBM5M" },
      ],
      [
        "with a trailing slash",
        "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M/",
        { provider: "spotify", resourceType: "playlist", resourceId: "37i9dQZF1DXcBWIGoYBM5M" },
      ],
      [
        "with a hash fragment",
        "https://open.spotify.com/track/003vvx7Niy0yvhvHt4a68B#footer",
        { provider: "spotify", resourceType: "track", resourceId: "003vvx7Niy0yvhvHt4a68B" },
      ],
      [
        "with an intl locale segment",
        "https://open.spotify.com/intl-de/playlist/37i9dQZF1DXcBWIGoYBM5M",
        { provider: "spotify", resourceType: "playlist", resourceId: "37i9dQZF1DXcBWIGoYBM5M" },
      ],
    ])("%s", (_label, url, expected) => {
      expect(spotifyDetector.detect(url)).toEqual(expected);
    });
  });

  describe("invalid or unsupported URLs", () => {
    it.each([
      ["wrong host (www.spotify.com)", "https://www.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M"],
      [
        "host spoofed in the path",
        "https://evil.com/open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M",
      ],
      ["embed page", "https://open.spotify.com/embed/playlist/37i9dQZF1DXcBWIGoYBM5M"],
      [
        "unsupported resource type: artist",
        "https://open.spotify.com/artist/06HL4z0CvFAxyc27GXpf02",
      ],
      ["unsupported resource type: user", "https://open.spotify.com/user/spotify"],
      ["unsupported resource type: show", "https://open.spotify.com/show/4rOoJ6Egrf8K2IrywzwOMk"],
      ["empty resource id", "https://open.spotify.com/playlist/"],
      ["Spotify home page (no resource)", "https://open.spotify.com/"],
      ["completely unrelated URL", "https://example.com/whatever"],
      ["empty string", ""],
      ["not a URL at all", "not a url"],
    ])("%s", (_label, url) => {
      expect(spotifyDetector.detect(url)).toBeNull();
    });
  });

  it("reports its provider slug", () => {
    expect(spotifyDetector.provider).toBe("spotify");
  });
});
