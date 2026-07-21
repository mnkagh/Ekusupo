/**
 * Real-world identifiers for a recording or release, independent of any
 * provider or of UPF's own `id`. See docs/universal-playlist-format.md.
 */
export interface ExternalIds {
  /** International Standard Recording Code — identifies a specific recording (Track). */
  isrc?: string;
  /** Universal Product Code — identifies a release (Album). */
  upc?: string;
  /** European Article Number — alternative release identifier (Album). */
  ean?: string;
}
