import type {
  AuthInput,
  AuthSession,
  MusicProvider,
  Page,
  PageRequest,
  ProviderCapabilities,
  ProviderProfile,
} from "@ekusupo/connector-sdk";
import type { Playlist } from "@ekusupo/upf";

import * as authOperations from "./auth.js";
import type { SpotifyAuthConfig } from "./auth.js";
import { createSpotifyHttpClient } from "./http.js";
import { spotifyManifest } from "./manifest.js";
import { normalizePlaylist } from "./normalize.js";
import type { SpotifyPagedResponse, SpotifyPlaylistObject, SpotifyUserObject } from "./types.js";

export interface SpotifyProviderConfig {
  clientId?: string;
  clientSecret?: string;
  fetchImpl?: typeof fetch;
  apiBaseUrl?: string;
}

const DEFAULT_PAGE_LIMIT = 20;

/**
 * Read-only reference implementation — validates UPF + the Connector SDK
 * contract, not a production-ready Spotify integration. See README.md.
 * Deliberately implements no write methods; their absence is the
 * capability signal (ADR-0004, decision 2).
 */
export function createSpotifyProvider(config: SpotifyProviderConfig = {}): MusicProvider {
  const http = createSpotifyHttpClient({
    fetchImpl: config.fetchImpl,
    apiBaseUrl: config.apiBaseUrl,
  });
  const authConfig: SpotifyAuthConfig = {
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    fetchImpl: config.fetchImpl,
  };

  return {
    manifest: spotifyManifest,

    getCapabilities(): ProviderCapabilities {
      return { supports: spotifyManifest.supportedCapabilities };
    },

    authenticate: (input: AuthInput) => authOperations.authenticate(authConfig, input),
    refreshAuthentication: (session: AuthSession) =>
      authOperations.refreshAuthentication(authConfig, session),
    revokeAuthentication: () => authOperations.revokeAuthentication(),

    async getProfile(session: AuthSession): Promise<ProviderProfile> {
      const user = await http.request<SpotifyUserObject>(session, "/me");
      return { id: user.id, displayName: user.display_name ?? undefined, email: user.email };
    },

    async listPlaylists(session: AuthSession, request?: PageRequest): Promise<Page<Playlist>> {
      const limit = request?.limit ?? DEFAULT_PAGE_LIMIT;
      const offset = request?.cursor ? Number(request.cursor) : 0;

      const page = await http.request<SpotifyPagedResponse<SpotifyPlaylistObject>>(
        session,
        `/me/playlists?limit=${limit}&offset=${offset}`,
      );

      return {
        items: page.items.map(normalizePlaylist),
        nextCursor: page.next ? String(offset + limit) : undefined,
      };
    },

    async getPlaylist(session: AuthSession, playlistId: string): Promise<Playlist> {
      const playlist = await http.request<SpotifyPlaylistObject>(
        session,
        `/playlists/${encodeURIComponent(playlistId)}`,
      );
      return normalizePlaylist(playlist);
    },
  };
}
