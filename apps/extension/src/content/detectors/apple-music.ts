import type { ResourceDetector } from "../../shared/detector-registry.js";
import type { DetectedResource, ResourceType } from "../../shared/messages.js";

/**
 * Apple Music URLs carry a mandatory storefront segment and a
 * human-readable slug that is decorative — the ID after it is what the
 * API takes:
 *
 *   /us/playlist/todays-hits/pl.f4d106fed2bd41149aaacabb233eb5eb
 *   /gb/album/random-access-memories/617154241
 *   /us/album/get-lucky/617154241?i=617154366   <- a track
 *
 * The last case is the one worth being careful about: a track on Apple
 * Music is an *album* URL with an `i` query parameter. Reading the path
 * alone would report a track link as an album and transfer the whole
 * record, so `i` is checked first and wins.
 *
 * Storefronts are two-letter codes, and playlist IDs carry a `pl.`
 * prefix that album and song IDs never do.
 */
const PLAYLIST_URL = /^\/[a-z]{2}\/playlist\/(?:[^/]+\/)?(pl\.[A-Za-z0-9-]+)$/;
const ALBUM_URL = /^\/[a-z]{2}\/album\/(?:[^/]+\/)?(\d+)$/;

export const appleMusicDetector: ResourceDetector = {
  provider: "apple-music",

  detect(url: string): DetectedResource | null {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return null;
    }

    if (parsed.hostname !== "music.apple.com") return null;

    const path = parsed.pathname.replace(/\/$/, "");

    const playlist = PLAYLIST_URL.exec(path);
    if (playlist?.[1]) return resource("playlist", playlist[1]);

    const album = ALBUM_URL.exec(path);
    if (album?.[1]) {
      // A song link is an album path plus ?i=<songId>.
      const songId = parsed.searchParams.get("i");
      if (songId && /^\d+$/.test(songId)) return resource("track", songId);
      return resource("album", album[1]);
    }

    return null;
  },
};

function resource(resourceType: ResourceType, resourceId: string): DetectedResource {
  return { provider: "apple-music", resourceType, resourceId };
}
