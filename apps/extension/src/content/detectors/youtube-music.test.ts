import { describe, expect, it } from "vitest";

import { youtubeMusicDetector } from "./youtube-music.js";

describe("youtubeMusicDetector", () => {
  it("detects a playlist from the list query parameter", () => {
    expect(
      youtubeMusicDetector.detect("https://music.youtube.com/playlist?list=PLabc123_-"),
    ).toEqual({
      provider: "youtube-music",
      resourceType: "playlist",
      resourceId: "PLabc123_-",
    });
  });

  it("detects a track from a watch URL", () => {
    expect(youtubeMusicDetector.detect("https://music.youtube.com/watch?v=dQw4w9WgXcQ")).toEqual({
      provider: "youtube-music",
      resourceType: "track",
      resourceId: "dQw4w9WgXcQ",
    });
  });

  it("ignores extra query parameters and keeps only the resource id", () => {
    // Real YouTube Music links carry playback state alongside the id.
    expect(
      youtubeMusicDetector.detect(
        "https://music.youtube.com/watch?v=dQw4w9WgXcQ&list=RDAMVM&index=3&t=42",
      ),
    ).toEqual({ provider: "youtube-music", resourceType: "track", resourceId: "dQw4w9WgXcQ" });
  });

  it("detects an album from an MPREb_ browse id", () => {
    expect(
      youtubeMusicDetector.detect("https://music.youtube.com/browse/MPREb_9nqEki4ZDpp"),
    ).toEqual({
      provider: "youtube-music",
      resourceType: "album",
      resourceId: "MPREb_9nqEki4ZDpp",
    });
  });

  it("does not claim non-album browse pages", () => {
    // /browse/ also serves artists (UC…) and the library, which are not
    // transferable resources — claiming them would show a transfer panel
    // on pages where the button could not do anything.
    expect(youtubeMusicDetector.detect("https://music.youtube.com/browse/UCabcdefg")).toBeNull();
    expect(
      youtubeMusicDetector.detect("https://music.youtube.com/browse/FEmusic_liked_playlists"),
    ).toBeNull();
  });

  it("ignores plain youtube.com, including watch pages", () => {
    expect(youtubeMusicDetector.detect("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(youtubeMusicDetector.detect("https://youtube.com/playlist?list=PLabc123")).toBeNull();
  });

  it("ignores the home page and search results", () => {
    expect(youtubeMusicDetector.detect("https://music.youtube.com/")).toBeNull();
    expect(youtubeMusicDetector.detect("https://music.youtube.com/search?q=daft+punk")).toBeNull();
  });

  it("returns null for a playlist URL with no list parameter", () => {
    expect(youtubeMusicDetector.detect("https://music.youtube.com/playlist")).toBeNull();
  });

  it("returns null rather than throwing on a malformed URL", () => {
    expect(youtubeMusicDetector.detect("not a url")).toBeNull();
    expect(youtubeMusicDetector.detect("")).toBeNull();
  });
});
