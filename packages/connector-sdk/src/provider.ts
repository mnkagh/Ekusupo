import type { Album, Artist, Playlist, Track } from "@ekusupo/upf";

import type { AuthInput, AuthSession } from "./auth.js";
import type { ProviderCapabilities } from "./capability.js";
import type { Page, PageRequest } from "./pagination.js";
import type { CreatePlaylistInput, UpdatePlaylistInput } from "./playlist-input.js";
import type { SearchQuery } from "./search.js";

/**
 * The contract every provider connector implements. Core depends only on
 * this interface — never on a specific provider (CLAUDE.md §3.1, §3.2).
 *
 * Every method that returns provider data returns UPF types directly.
 * Capability-gated methods are optional: a provider that doesn't support
 * an operation simply doesn't implement it. `getCapabilities()` is the
 * declarative source of truth callers check before calling anything else.
 * See docs/connector-sdk.md and ADR-0004.
 */
export interface MusicProvider {
  /** Stable slug, e.g. "spotify" — a runtime value, never a type. */
  readonly id: string;
  readonly displayName: string;

  getCapabilities(): ProviderCapabilities;

  authenticate(input: AuthInput): Promise<AuthSession>;
  refreshAuthentication(session: AuthSession): Promise<AuthSession>;
  revokeAuthentication(session: AuthSession): Promise<void>;

  listPlaylists?(session: AuthSession, request?: PageRequest): Promise<Page<Playlist>>;
  getPlaylist?(session: AuthSession, playlistId: string): Promise<Playlist>;
  createPlaylist?(session: AuthSession, input: CreatePlaylistInput): Promise<Playlist>;
  updatePlaylist?(
    session: AuthSession,
    playlistId: string,
    input: UpdatePlaylistInput,
  ): Promise<Playlist>;
  deletePlaylist?(session: AuthSession, playlistId: string): Promise<void>;
  reorderPlaylistItems?(
    session: AuthSession,
    playlistId: string,
    itemIds: string[],
  ): Promise<Playlist>;
  addTracksToPlaylist?(
    session: AuthSession,
    playlistId: string,
    tracks: Track[],
  ): Promise<Playlist>;
  removeTracksFromPlaylist?(
    session: AuthSession,
    playlistId: string,
    trackIds: string[],
  ): Promise<Playlist>;

  searchTracks?(
    session: AuthSession,
    query: SearchQuery,
    request?: PageRequest,
  ): Promise<Page<Track>>;
  searchAlbums?(
    session: AuthSession,
    query: SearchQuery,
    request?: PageRequest,
  ): Promise<Page<Album>>;
  searchArtists?(
    session: AuthSession,
    query: SearchQuery,
    request?: PageRequest,
  ): Promise<Page<Artist>>;

  listSavedTracks?(session: AuthSession, request?: PageRequest): Promise<Page<Track>>;
  listSavedAlbums?(session: AuthSession, request?: PageRequest): Promise<Page<Album>>;
}
