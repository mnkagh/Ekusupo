import type { Artwork } from "./artwork.js";
import type { ProviderRefs } from "./provider-ref.js";
import type { Track } from "./track.js";

export type PlaylistPrivacy = "public" | "private" | "unlisted" | "unknown";

/**
 * A thin wrapper, not a bare `Track`, so per-item metadata (when it was
 * added, by whom) has somewhere to live without polluting `Track` itself —
 * the same track can appear in many playlists with different `addedAt`
 * values.
 */
export interface PlaylistItem {
  /** Embedded, not referenced. */
  track: Track;
  /** ISO 8601. */
  addedAt?: string;
  /**
   * Opaque identifier (e.g. a provider-scoped user id) — not a full `User`
   * domain object; that belongs to packages/core, not UPF.
   */
  addedBy?: string;
}

export interface Playlist {
  id: string;
  title: string;
  description?: string;
  /** Array order is track order. May be empty. */
  items: PlaylistItem[];
  artwork?: Artwork;
  privacy?: PlaylistPrivacy;
  providerRefs?: ProviderRefs;
  /** ISO 8601. Not every provider exposes this. */
  createdAt?: string;
  updatedAt?: string;
}
