import type { Album, Artist, Playlist, Track } from "@ekusupo/upf";


import type { DeezerAlbum, DeezerArtist, DeezerPlaylist, DeezerTrack } from "./types.js";

/**
 * Internal to this package only — never exported from index.ts. Core
 * never needs to know these exist; every public MusicProvider method
 * returns UPF types directly (ADR-0004, decision 1).
 */

export function normalizeArtist(artist: DeezerArtist): Artist {
  return {
    id: String(artist.id),
    name: artist.name,
    providerRefs: {
      deezer: { id: String(artist.id), url: `https://www.deezer.com/artist/${artist.id}` },
    },
  };
}

export function normalizeAlbum(album: DeezerAlbum): Album {
  const cover = album.cover_big ?? album.cover_medium;
  return {
    id: String(album.id),
    title: album.title,
    artists: [],
    artwork: cover ? [{ url: cover }] : undefined,
    providerRefs: {
      deezer: { id: String(album.id), url: `https://www.deezer.com/album/${album.id}` },
    },
  };
}

export function normalizeTrack(track: DeezerTrack): Track {
  return {
    id: String(track.id),
    title: track.title,
    artists: [normalizeArtist(track.artist)],
    album: track.album ? normalizeAlbum(track.album) : undefined,
    // Deezer counts seconds; UPF is milliseconds everywhere.
    durationMs: track.duration * 1000,
    externalIds: track.isrc ? { isrc: track.isrc } : undefined,
    providerRefs: {
      deezer: { id: String(track.id), url: `https://www.deezer.com/track/${track.id}` },
    },
  };
}

export function normalizePlaylist(playlist: DeezerPlaylist): Playlist {
  const cover = playlist.picture_big ?? playlist.picture_medium;

  return {
    id: String(playlist.id),
    title: playlist.title,
    description: playlist.description ?? undefined,
    items: (playlist.tracks.data ?? []).map((track) => ({ track: normalizeTrack(track) })),
    artwork: cover ? [{ url: cover }] : undefined,
    privacy:
      playlist.public === true ? "public" : playlist.public === false ? "private" : "unknown",
    providerRefs: {
      deezer: { id: String(playlist.id), url: `https://www.deezer.com/playlist/${playlist.id}` },
    },
  };
}
