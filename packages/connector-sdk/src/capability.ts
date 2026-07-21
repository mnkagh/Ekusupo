/**
 * Closed union of capability strings. Not every provider supports every
 * operation — CLAUDE.md §3.4. Callers check `ProviderCapabilities.supports`
 * before invoking the corresponding optional `MusicProvider` method.
 */
export type ProviderCapability =
  | "profile.read"
  | "playlists.read"
  | "playlists.create"
  | "playlists.update"
  | "playlists.delete"
  | "playlists.reorder"
  | "playlists.addTracks"
  | "playlists.removeTracks"
  | "playlists.artwork"
  | "tracks.search"
  | "tracks.searchByIsrc"
  | "albums.search"
  | "artists.search"
  | "savedTracks.read"
  | "savedAlbums.read"
  | "sync"
  | "batch";

export interface ProviderLimits {
  maxBatchSize?: number;
  requestsPerSecond?: number;
  requestsPerDay?: number;
}

/**
 * A `Set`, not a method — needs to be inspectable/renderable directly
 * (e.g. for a future provider capability matrix UI, CLAUDE.md §2.2).
 */
export interface ProviderCapabilities {
  supports: ReadonlySet<ProviderCapability>;
  limits?: ProviderLimits;
}
