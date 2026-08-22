/**
 * Spotify Web API response shapes. Package-private — never re-exported
 * from index.ts. This is deliberately where "Spotify-specific concepts"
 * live, contained per CLAUDE.md §6.5 and ADR-0004.
 *
 * Shapes are trimmed to the fields this package actually reads, not full
 * API fidelity — see https://developer.spotify.com/documentation/web-api
 * for the complete reference.
 */

export interface SpotifyImage {
  url: string;
  width?: number | null;
  height?: number | null;
}

/** The simplified artist object nested in tracks/albums — no images. */
export interface SpotifyArtistObject {
  id: string;
  name: string;
  external_urls?: { spotify?: string };
}

/** The simplified album object nested in a track. */
export interface SpotifyAlbumObject {
  id: string;
  name: string;
  release_date?: string;
  total_tracks?: number;
  images?: SpotifyImage[];
  artists: SpotifyArtistObject[];
  external_urls?: { spotify?: string };
}

export interface SpotifyTrackObject {
  id: string;
  name: string;
  duration_ms: number;
  explicit: boolean;
  track_number?: number;
  disc_number?: number;
  artists: SpotifyArtistObject[];
  album?: SpotifyAlbumObject;
  external_ids?: { isrc?: string; upc?: string; ean?: string };
  external_urls?: { spotify?: string };
}

export interface SpotifyPlaylistTrackItem {
  added_at?: string;
  added_by?: { id?: string };
  /**
   * Null when the entry's audio is gone from Spotify's catalogue — a
   * removed release, an unavailable local file. Real playlists contain
   * these; the type says so rather than letting a dereference of `.id`
   * discover it at runtime.
   */
  track: SpotifyTrackObject | null;
}

/**
 * One page of a playlist's tracks. `next` is an **absolute URL** to the
 * following page, or null on the last one — Spotify builds it, so it is
 * followed verbatim rather than reconstructed from offsets.
 */
export interface SpotifyPagedTracks {
  items?: SpotifyPlaylistTrackItem[];
  total: number;
  next?: string | null;
}

export interface SpotifyPlaylistObject {
  id: string;
  name: string;
  description?: string | null;
  public?: boolean | null;
  collaborative?: boolean;
  snapshot_id?: string;
  images?: SpotifyImage[];
  owner?: { id?: string; display_name?: string };
  /**
   * `items` is only populated by the single-playlist endpoint
   * (`GET /playlists/{id}`) — the list endpoint (`GET /me/playlists`)
   * returns simplified playlist objects with just a `total` count.
   *
   * And even there it is only the **first page**: Spotify caps this at
   * 100 items and puts the rest behind `next`. `total` is the real
   * length, which is what makes a short read detectable rather than
   * silent — see `getPlaylist`.
   */
  tracks: SpotifyPagedTracks;
  external_urls?: { spotify?: string };
}

export interface SpotifyUserObject {
  id: string;
  display_name?: string | null;
  email?: string;
}

export interface SpotifyPagedResponse<T> {
  items: T[];
  next?: string | null;
  limit: number;
  offset: number;
  total: number;
}

/** POST https://accounts.spotify.com/api/token response shape. */
export interface SpotifyTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
}
