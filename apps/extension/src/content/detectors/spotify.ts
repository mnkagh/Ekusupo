import type { ResourceDetector } from "../../shared/detector-registry.js";
import type { DetectedResource, ResourceType } from "../../shared/messages.js";

/**
 * Matches https://open.spotify.com/{playlist|album|track}/{id}, with an
 * optional locale segment (intl-xx/) and an optional trailing slash,
 * query string, or hash. Deliberately does not match other Spotify hosts
 * (www.spotify.com), embed pages (open.spotify.com/embed/...), or
 * resource types outside playlist/album/track (artist, user, show) — out
 * of scope per docs/browser-extension.md.
 */
const SPOTIFY_RESOURCE_URL =
  /^https?:\/\/open\.spotify\.com\/(?:intl-[a-z]{2}\/)?(playlist|album|track)\/([A-Za-z0-9]+)(?:[/?#].*)?$/;

export const spotifyDetector: ResourceDetector = {
  provider: "spotify",

  detect(url: string): DetectedResource | null {
    const match = SPOTIFY_RESOURCE_URL.exec(url);
    if (!match) return null;

    const [, resourceType, resourceId] = match;
    if (!resourceType || !resourceId) return null;

    return {
      provider: "spotify",
      resourceType: resourceType as ResourceType,
      resourceId,
    };
  },
};
