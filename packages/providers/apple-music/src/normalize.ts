import type { Artwork, Playlist, Track } from "@ekusupo/upf";

import type { AppleArtwork, ApplePlaylist, AppleSong } from "./types.js";

/**
 * Internal to this package only — never exported from index.ts. Core
 * never needs to know these exist; every public MusicProvider method
 * returns UPF types directly (ADR-0004, decision 1).
 */

/**
 * Apple returns artwork as a template with `{w}` / `{h}` placeholders
 * rather than a concrete URL, so it has to be resolved to a size before
 * it is usable. 600px is a reasonable single choice for a list UI —
 * exporting the raw template would leak an Apple-specific convention
 * into UPF, where every other provider supplies a real URL.
 */
const ARTWORK_SIZE = 600;

function normalizeArtwork(artwork: AppleArtwork | undefined): Artwork | undefined {
  if (!artwork?.url) return undefined;
  return [
    {
      url: artwork.url.replace("{w}", String(ARTWORK_SIZE)).replace("{h}", String(ARTWORK_SIZE)),
      width: ARTWORK_SIZE,
      height: ARTWORK_SIZE,
    },
  ];
}

/**
 * Apple gives `artistName` as a single display string — "A, B & C" —
 * with no per-artist identity. Splitting it would invent structure that
 * is not in the data and would produce wrong names for artists whose
 * own name contains a comma or ampersand.
 *
 * So it stays one artist entry with no id. The matching engine's
 * ISRC-first strategy does not depend on artist identity, and a
 * confidently wrong split would be worse than an honest single value.
 */
function normalizeArtists(artistName: string | undefined) {
  if (!artistName) return [];
  return [{ id: "", name: artistName }];
}

export function normalizeTrack(song: AppleSong): Track {
  const attributes = song.attributes;

  return {
    id: song.id,
    title: attributes?.name ?? "",
    artists: normalizeArtists(attributes?.artistName),
    durationMs: attributes?.durationInMillis,
    // Apple exposes a `contentRating` of "explicit" or "clean", and
    // omits it entirely for the majority of tracks — so unlike Spotify,
    // "unknown" is the common case here rather than an edge one.
    explicit:
      attributes?.contentRating === "explicit"
        ? "explicit"
        : attributes?.contentRating === "clean"
          ? "clean"
          : "unknown",
    externalIds: attributes?.isrc ? { isrc: attributes.isrc } : undefined,
    providerRefs: {
      "apple-music": {
        id: song.id,
        url: `https://music.apple.com/song/${song.id}`,
        raw: { ...song },
      },
    },
  };
}

export function normalizePlaylist(playlist: ApplePlaylist): Playlist {
  const attributes = playlist.attributes;

  return {
    id: playlist.id,
    title: attributes?.name ?? "",
    description: attributes?.description?.standard ?? attributes?.description?.short,
    items: (playlist.relationships?.tracks?.data ?? []).map((song) => ({
      track: normalizeTrack(song),
    })),
    artwork: normalizeArtwork(attributes?.artwork),
    privacy:
      attributes?.isPublic === true
        ? "public"
        : attributes?.isPublic === false
          ? "private"
          : "unknown",
    providerRefs: {
      "apple-music": {
        id: playlist.id,
        url: `https://music.apple.com/playlist/${playlist.id}`,
      },
    },
  };
}
