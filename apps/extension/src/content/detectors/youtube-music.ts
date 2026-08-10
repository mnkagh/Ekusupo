import type { ResourceDetector } from "../../shared/detector-registry.js";
import type { DetectedResource, ResourceType } from "../../shared/messages.js";

/**
 * YouTube Music puts the resource in the query string rather than the
 * path, which is why this detector parses instead of pattern-matching a
 * path the way the Spotify one does:
 *
 *   /playlist?list=PL…      -> playlist
 *   /watch?v=…              -> track
 *   /browse/MPREb_…         -> album
 *
 * Albums are the awkward case. YouTube Music addresses them by an opaque
 * browse ID (`MPREb_` prefix) under /browse/, and *also* by a `list=OLAK5uy_…`
 * playlist ID. Only the `MPREb_` form is unambiguously an album, so that
 * is the only one claimed here; an `OLAK5uy_` link reports as a playlist,
 * which is what the YouTube Data API treats it as anyway.
 *
 * `music.youtube.com` only — a plain youtube.com video is not a music
 * resource, and claiming it would put a transfer panel on every video on
 * the site.
 */
const ALBUM_BROWSE_ID = /^MPREb_[A-Za-z0-9_-]+$/;

export const youtubeMusicDetector: ResourceDetector = {
  provider: "youtube-music",

  detect(url: string): DetectedResource | null {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return null;
    }

    if (parsed.hostname !== "music.youtube.com") return null;

    const match = matchPath(parsed);
    if (!match) return null;

    const [resourceType, resourceId] = match;
    return { provider: "youtube-music", resourceType, resourceId };
  },
};

function matchPath(url: URL): [ResourceType, string] | null {
  const path = url.pathname.replace(/\/$/, "");

  if (path === "/playlist") {
    const list = url.searchParams.get("list");
    return list ? ["playlist", list] : null;
  }

  if (path === "/watch") {
    const video = url.searchParams.get("v");
    return video ? ["track", video] : null;
  }

  const browse = /^\/browse\/([A-Za-z0-9_-]+)$/.exec(path);
  if (browse?.[1] && ALBUM_BROWSE_ID.test(browse[1])) {
    return ["album", browse[1]];
  }

  return null;
}
