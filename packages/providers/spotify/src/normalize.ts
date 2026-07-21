import type { Album, Artist, Artwork, Playlist, Track } from "@ekusupo/upf";

import type {
  SpotifyAlbumObject,
  SpotifyArtistObject,
  SpotifyImage,
  SpotifyPlaylistObject,
  SpotifyTrackObject,
} from "./types.js";

/**
 * Internal to this package only — never exported from index.ts. Core never
 * needs to know these exist; every public MusicProvider method returns
 * UPF types directly (ADR-0004, decision 1).
 */

function normalizeArtwork(images: SpotifyImage[] | undefined): Artwork | undefined {
  if (!images || images.length === 0) return undefined;
  return images.map((image) => ({
    url: image.url,
    width: image.width ?? undefined,
    height: image.height ?? undefined,
  }));
}

export function normalizeArtist(artist: SpotifyArtistObject): Artist {
  return {
    id: artist.id,
    name: artist.name,
    providerRefs: {
      spotify: { id: artist.id, url: artist.external_urls?.spotify },
    },
  };
}

export function normalizeAlbum(album: SpotifyAlbumObject): Album {
  return {
    id: album.id,
    title: album.name,
    artists: album.artists.map(normalizeArtist),
    releaseDate: album.release_date,
    totalTracks: album.total_tracks,
    artwork: normalizeArtwork(album.images),
    providerRefs: {
      spotify: { id: album.id, url: album.external_urls?.spotify },
    },
  };
}

export function normalizeTrack(track: SpotifyTrackObject): Track {
  return {
    id: track.id,
    title: track.name,
    artists: track.artists.map(normalizeArtist),
    album: track.album ? normalizeAlbum(track.album) : undefined,
    durationMs: track.duration_ms,
    // Spotify's `explicit` field is always a boolean — never "unknown" here,
    // a concrete case of the tri-state accommodating a provider that
    // always discloses it (docs/universal-playlist-format.md).
    explicit: track.explicit ? "explicit" : "clean",
    trackNumber: track.track_number,
    discNumber: track.disc_number,
    externalIds: track.external_ids?.isrc ? { isrc: track.external_ids.isrc } : undefined,
    providerRefs: {
      spotify: { id: track.id, url: track.external_urls?.spotify, raw: { ...track } },
    },
  };
}

export function normalizePlaylist(playlist: SpotifyPlaylistObject): Playlist {
  return {
    id: playlist.id,
    title: playlist.name,
    description: playlist.description ?? undefined,
    // The list endpoint doesn't populate `tracks.items` (only `total`) —
    // items is legitimately empty there; only the single-playlist fetch
    // populates it. See types.ts.
    items: (playlist.tracks.items ?? []).map((item) => ({
      track: normalizeTrack(item.track),
      addedAt: item.added_at,
      addedBy: item.added_by?.id,
    })),
    artwork: normalizeArtwork(playlist.images),
    privacy:
      playlist.public === true ? "public" : playlist.public === false ? "private" : "unknown",
    providerRefs: {
      spotify: {
        id: playlist.id,
        url: playlist.external_urls?.spotify,
        raw: { snapshotId: playlist.snapshot_id, collaborative: playlist.collaborative },
      },
    },
  };
}
