/**
 * Apple Music API shapes, narrowed to the fields this connector reads.
 *
 * Not exported from the package index (ADR-0004): consumers only ever
 * see `MusicProvider` and UPF types, never a vendor's own JSON.
 */

export interface AppleArtwork {
  url: string;
  width?: number;
  height?: number;
}

export interface AppleSongAttributes {
  name: string;
  artistName: string;
  albumName?: string;
  durationInMillis?: number;
  isrc?: string;
  contentRating?: string;
  artwork?: AppleArtwork;
  releaseDate?: string;
}

export interface AppleSong {
  id: string;
  type: string;
  attributes?: AppleSongAttributes;
}

export interface ApplePlaylistAttributes {
  name: string;
  description?: { standard?: string; short?: string };
  isPublic?: boolean;
  artwork?: AppleArtwork;
}

export interface ApplePlaylist {
  id: string;
  type: string;
  attributes?: ApplePlaylistAttributes;
  relationships?: {
    tracks?: {
      data: AppleSong[];
      next?: string;
    };
  };
}

/** Every Apple Music response wraps its payload in `data`. */
export interface AppleResponse<T> {
  data: T[];
  next?: string;
}

export interface AppleSearchResponse {
  results?: {
    songs?: {
      data: AppleSong[];
    };
  };
}
