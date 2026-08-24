/**
 * Deezer public API response shapes, trimmed to the fields this package
 * reads. Package-private — never exported from index.ts.
 *
 * Durations are seconds in Deezer's API and become milliseconds in UPF.
 */

export interface DeezerArtist {
  id: number;
  name: string;
}

export interface DeezerAlbum {
  id: number;
  title: string;
  cover_medium?: string;
  cover_big?: string;
  cover_xl?: string;
}

export interface DeezerTrack {
  id: number;
  title: string;
  /** Seconds, not milliseconds. */
  duration: number;
  isrc?: string;
  artist: DeezerArtist;
  album?: DeezerAlbum;
}

export interface DeezerPagedTracks {
  data?: DeezerTrack[];
  total?: number;
  /** Absolute URL of the following page, or absent on the last one. */
  next?: string | null;
}

export interface DeezerPlaylist {
  id: number;
  title: string;
  description?: string | null;
  public?: boolean;
  picture_medium?: string;
  picture_big?: string;
  creator?: { name?: string };
  tracks: DeezerPagedTracks;
}

export interface DeezerSearchResponse {
  data?: DeezerTrack[];
  total?: number;
  next?: string | null;
}

/** Deezer answers some failures with a 200 and an error object. */
export interface DeezerErrorBody {
  error?: { type?: string; message?: string; code?: number };
}
