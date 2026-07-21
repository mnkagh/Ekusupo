import type { Album } from "./album.js";
import type { Artist } from "./artist.js";
import type { ExternalIds } from "./external-ids.js";
import type { ProviderRefs } from "./provider-ref.js";

/**
 * Tri-state, not boolean — many providers don't disclose explicit content
 * status per track, and collapsing that into `false` would assert
 * something UPF doesn't actually know.
 */
export type ExplicitContentState = "explicit" | "clean" | "unknown";

export interface Track {
  id: string;
  title: string;
  /** Ordered; first entry is the primary artist. */
  artists: Artist[];
  /** Some tracks aren't grouped under an album (e.g. singles from certain providers). */
  album?: Album;
  /** Integer milliseconds. */
  durationMs?: number;
  explicit?: ExplicitContentState;
  /** Typically `isrc`. */
  externalIds?: ExternalIds;
  providerRefs?: ProviderRefs;
  /** Position within its album, if known. */
  trackNumber?: number;
  discNumber?: number;
}
