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
import type {
  SpotifyPagedResponse,
  SpotifyPagedTracks,
  SpotifyPlaylistObject,
  SpotifyUserObject,
} from "./types.js";

export interface SpotifyProviderConfig {
  clientId?: string;
  clientSecret?: string;
  fetchImpl?: typeof fetch;
  apiBaseUrl?: string;
}

const DEFAULT_PAGE_LIMIT = 20;

/**
 * At 100 tracks a page, 100 pages is 10,000 tracks — comfortably past
 * Spotify's own 10,000-item playlist limit. A bound rather than a
 * `while (next)` because a paging bug on either side should stop, not
 * loop forever against someone's rate limit.
 */
const MAX_TRACK_PAGES = 100;

/**
 * An app-level session for reading public catalog data with nobody
 * signed in — see `authenticateAsApp`.
 *
 * Standalone rather than a method on `MusicProvider`: that interface is
 * provider-agnostic and must not grow a concept only some providers
 * have (CLAUDE.md §3.1). A caller that wants this asks Spotify for it
 * directly, and the resulting session is an ordinary `AuthSession` that
 * every provider-agnostic path downstream handles unchanged.
 */
export function createSpotifyAppSession(config: SpotifyProviderConfig = {}): Promise<AuthSession> {
  return authOperations.authenticateAsApp({
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    fetchImpl: config.fetchImpl,
  });
}

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

      // A cursor this connector issued is always a plain number, but one
      // from elsewhere need not be — `Number("x")` would put a literal
      // `NaN` in the URL and read nothing. Fall back to the first page.
      const parsed = Number(request?.cursor);
      const offset = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;

      const page = await http.request<SpotifyPagedResponse<SpotifyPlaylistObject>>(
        session,
        `/me/playlists?limit=${limit}&offset=${offset}`,
      );

      return {
        items: page.items.map(normalizePlaylist),
        // The *response's* own offset and item count, not the limit that
        // was asked for: Spotify clamps `limit` to its maximum (50 for
        // /me/playlists), so advancing by the request's value skips
        // playlists on every page past the first.
        nextCursor: page.next ? String(page.offset + page.items.length) : undefined,
      };
    },

    /**
     * Follows `tracks.next` to the end of the playlist.
     *
     * `GET /playlists/{id}` returns only the first 100 tracks. Reading
     * that one page and stopping — which this did until it was caught —
     * silently drops every track past the hundredth from a transfer,
     * while the report still says it succeeded. A short read that looks
     * like a complete one is the worst failure mode this connector can
     * have, so it is not merely fixed but bounded: the loop stops on a
     * missing `next`, on a page that returns nothing, and at a hard cap.
     */
    async getPlaylist(session: AuthSession, playlistId: string): Promise<Playlist> {
      const playlist = await http.request<SpotifyPlaylistObject>(
        session,
        `/playlists/${encodeURIComponent(playlistId)}`,
      );

      const items = [...(playlist.tracks.items ?? [])];
      let next = playlist.tracks.next;

      for (let page = 1; next && page < MAX_TRACK_PAGES; page += 1) {
        const following = await http.requestUrl<SpotifyPagedTracks>(session, next);
        const pageItems = following.items ?? [];
        // A `next` that yields nothing would otherwise spin until the
        // cap, doing nothing but burning rate limit.
        if (pageItems.length === 0) break;
        items.push(...pageItems);
        next = following.next;
      }

      return normalizePlaylist({ ...playlist, tracks: { ...playlist.tracks, items } });
    },
  };
}
