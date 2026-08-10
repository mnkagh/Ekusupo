import { describe, expect, it } from "vitest";

import { appleMusicDetector } from "./apple-music.js";

describe("appleMusicDetector", () => {
  it("detects a playlist behind its storefront and slug", () => {
    expect(
      appleMusicDetector.detect(
        "https://music.apple.com/us/playlist/todays-hits/pl.f4d106fed2bd41149aaacabb233eb5eb",
      ),
    ).toEqual({
      provider: "apple-music",
      resourceType: "playlist",
      resourceId: "pl.f4d106fed2bd41149aaacabb233eb5eb",
    });
  });

  it("detects an album", () => {
    expect(
      appleMusicDetector.detect(
        "https://music.apple.com/gb/album/random-access-memories/617154241",
      ),
    ).toEqual({ provider: "apple-music", resourceType: "album", resourceId: "617154241" });
  });

  it("reports a song link as a track, not the album it sits on", () => {
    // The trap this detector exists to avoid: on Apple Music a single
    // song IS an album URL with ?i=. Reading the path alone would send
    // the whole record instead of the one song the user was looking at.
    expect(
      appleMusicDetector.detect("https://music.apple.com/us/album/get-lucky/617154241?i=617154366"),
    ).toEqual({ provider: "apple-music", resourceType: "track", resourceId: "617154366" });
  });

  it("falls back to the album when i= is not a song id", () => {
    expect(
      appleMusicDetector.detect("https://music.apple.com/us/album/get-lucky/617154241?i=notanid"),
    ).toEqual({ provider: "apple-music", resourceType: "album", resourceId: "617154241" });
  });

  it("accepts any two-letter storefront", () => {
    for (const storefront of ["us", "gb", "in", "jp"]) {
      expect(appleMusicDetector.detect(`https://music.apple.com/${storefront}/album/x/1`)).toEqual({
        provider: "apple-music",
        resourceType: "album",
        resourceId: "1",
      });
    }
  });

  it("tolerates a missing slug", () => {
    expect(
      appleMusicDetector.detect(
        "https://music.apple.com/us/playlist/pl.f4d106fed2bd41149aaacabb233eb5eb",
      ),
    ).toEqual({
      provider: "apple-music",
      resourceType: "playlist",
      resourceId: "pl.f4d106fed2bd41149aaacabb233eb5eb",
    });
  });

  it("ignores artist, search, and browse pages", () => {
    expect(
      appleMusicDetector.detect("https://music.apple.com/us/artist/daft-punk/5468295"),
    ).toBeNull();
    expect(
      appleMusicDetector.detect("https://music.apple.com/us/search?term=daft+punk"),
    ).toBeNull();
    expect(appleMusicDetector.detect("https://music.apple.com/us/browse")).toBeNull();
  });

  it("ignores other Apple hosts", () => {
    expect(appleMusicDetector.detect("https://www.apple.com/us/album/x/1")).toBeNull();
    expect(appleMusicDetector.detect("https://embed.music.apple.com/us/album/x/1")).toBeNull();
  });

  it("returns null rather than throwing on a malformed URL", () => {
    expect(appleMusicDetector.detect("music.apple.com/us/album/x/1")).toBeNull();
    expect(appleMusicDetector.detect("")).toBeNull();
  });
});
