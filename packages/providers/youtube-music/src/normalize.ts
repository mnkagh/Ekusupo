import type { Artwork, Playlist, Track } from "@ekusupo/upf";

import type {
  YouTubePlaylist,
  YouTubePlaylistItem,
  YouTubeSearchItem,
  YouTubeThumbnails,
} from "./types.js";

/** Internal to this package only — never exported from index.ts (ADR-0004). */

function normalizeArtwork(thumbnails: YouTubeThumbnails | undefined): Artwork | undefined {
  const best = thumbnails?.maxres ?? thumbnails?.standard ?? thumbnails?.high ?? thumbnails?.medium;
  if (!best) return undefined;
  return [{ url: best.url, width: best.width, height: best.height }];
}

/**
 * YouTube titles are not track titles. A video is called things like
 * "Artist - Title (Official Video) [4K]", and the channel is often
 * "Artist - Topic" for auto-generated music entries.
 *
 * This strips the parts that are reliably noise and splits on the first
 * " - " only. It is deliberately conservative: aggressive cleanup would
 * mangle titles that legitimately contain brackets or dashes, and the
 * matching engine can recover from a slightly noisy title far more
 * easily than from a title that had real words removed.
 */
const NOISE = /\s*[([](?:official|lyric|audio|video|hd|hq|4k|mv|m\/v)[^)\]]*[)\]]/gi;

export function parseVideoTitle(
  rawTitle: string,
  channelTitle?: string,
): { title: string; artist: string } {
  const cleaned = rawTitle.replace(NOISE, "").trim();

  const separator = cleaned.indexOf(" - ");
  if (separator > 0) {
    return {
      artist: cleaned.slice(0, separator).trim(),
      title: cleaned.slice(separator + 3).trim(),
    };
  }

  // No separator: fall back to the channel, dropping YouTube's "- Topic"
  // suffix, which marks auto-generated artist channels.
  const artist = (channelTitle ?? "").replace(/\s*-\s*Topic$/i, "").trim();
  return { title: cleaned, artist };
}

export function normalizePlaylistItem(item: YouTubePlaylistItem): Track {
  const snippet = item.snippet;
  const videoId = snippet?.resourceId?.videoId ?? "";
  const { title, artist } = parseVideoTitle(
    snippet?.title ?? "",
    snippet?.videoOwnerChannelTitle ?? snippet?.channelTitle,
  );

  return {
    id: videoId,
    title,
    artists: artist ? [{ id: "", name: artist }] : [],
    // YouTube's playlistItems response carries no duration and no ISRC —
    // duration needs a second videos.list call, and ISRC does not exist
    // in this API at all. Both are left absent rather than guessed,
    // which is what makes YouTube a weaker matching source than Spotify
    // or Apple.
    explicit: "unknown",
    providerRefs: {
      "youtube-music": {
        id: videoId,
        url: videoId ? `https://music.youtube.com/watch?v=${videoId}` : undefined,
        raw: { originalTitle: snippet?.title, channel: snippet?.videoOwnerChannelTitle },
      },
    },
  };
}

export function normalizeSearchItem(item: YouTubeSearchItem): Track {
  const videoId = item.id?.videoId ?? "";
  const { title, artist } = parseVideoTitle(item.snippet?.title ?? "", item.snippet?.channelTitle);

  return {
    id: videoId,
    title,
    artists: artist ? [{ id: "", name: artist }] : [],
    explicit: "unknown",
    providerRefs: {
      "youtube-music": {
        id: videoId,
        url: videoId ? `https://music.youtube.com/watch?v=${videoId}` : undefined,
      },
    },
  };
}

export function normalizePlaylist(
  playlist: YouTubePlaylist,
  items: YouTubePlaylistItem[],
): Playlist {
  return {
    id: playlist.id,
    title: playlist.snippet?.title ?? "",
    description: playlist.snippet?.description || undefined,
    items: items.map((item) => ({
      track: normalizePlaylistItem(item),
      addedAt: item.snippet?.publishedAt,
    })),
    artwork: normalizeArtwork(playlist.snippet?.thumbnails),
    // "unlisted" has no UPF equivalent and is not "public" — treating it
    // as public would overstate how visible a transferred playlist is.
    privacy:
      playlist.status?.privacyStatus === "public"
        ? "public"
        : playlist.status?.privacyStatus === "private"
          ? "private"
          : "unknown",
    providerRefs: {
      "youtube-music": {
        id: playlist.id,
        url: `https://music.youtube.com/playlist?list=${playlist.id}`,
      },
    },
  };
}
