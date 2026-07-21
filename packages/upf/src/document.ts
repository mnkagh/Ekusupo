import type { Playlist } from "./playlist.js";

export const UPF_FORMAT_NAME = "upf" as const;
export const UPF_FORMAT_VERSION = "0.1.0" as const;

export interface UpfSource {
  /** A runtime provider slug (e.g. "spotify"), never a closed type-level union. */
  provider?: string;
  /** Exporting application/tool name. */
  exportedBy?: string;
  exportedByVersion?: string;
}

/**
 * v0.1 is playlists-only — see docs/universal-playlist-format.md#scope-of-v01.
 */
export interface UpfDocument {
  format: typeof UPF_FORMAT_NAME;
  /** Semver string for the UPF schema version, e.g. "0.1.0". */
  version: string;
  /** ISO 8601 timestamp of when this document was produced. */
  createdAt: string;
  /** Omitted for hand-authored/merged documents. */
  source?: UpfSource;
  playlists: Playlist[];
}
