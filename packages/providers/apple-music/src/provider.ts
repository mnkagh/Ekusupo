import { ConnectorError } from "@ekusupo/connector-sdk";
import type {
  AuthInput,
  AuthSession,
  MusicProvider,
  Page,
  ProviderCapabilities,
  ProviderProfile,
  SearchQuery,
} from "@ekusupo/connector-sdk";
import type { Playlist, Track } from "@ekusupo/upf";

import { createAppleMusicHttpClient } from "./http.js";
import { appleMusicManifest } from "./manifest.js";
import { normalizePlaylist, normalizeTrack } from "./normalize.js";
import type { AppleResponse, ApplePlaylist, AppleSearchResponse, AppleSong } from "./types.js";

export interface AppleMusicProviderConfig {
  /**
   * The signed JWT identifying your app. Generated server-side from an
   * Apple Developer private key — it cannot be produced by this package,
   * and it cannot safely live in a browser client.
   */
  developerToken?: string;
  /** ISO country code for catalogue requests. Apple requires one on every catalogue path. */
  storefront?: string;
  fetchImpl?: typeof fetch;
  apiBaseUrl?: string;
}

const DEFAULT_STOREFRONT = "us";

/**
 * Read-only Apple Music connector.
 *
 * Unlike Spotify's, this one declares `tracks.search`, which is what
 * makes it useful as a *destination* in a Dry Run: the engine can look
 * up each source track in Apple's catalogue and produce real match
 * decisions rather than reporting that the destination cannot search
 * (ADR-0011).
 *
 * Writing is deliberately unimplemented. Apple Music supports playlist
 * creation, but the manifest describes what this code does rather than
 * what the vendor offers, and the absence of the method *is* the
 * capability signal (ADR-0004, decision 2).
 */
export function createAppleMusicProvider(config: AppleMusicProviderConfig = {}): MusicProvider {
  const http = createAppleMusicHttpClient({
    fetchImpl: config.fetchImpl,
    apiBaseUrl: config.apiBaseUrl,
  });
  const storefront = config.storefront ?? DEFAULT_STOREFRONT;

  return {
    manifest: appleMusicManifest,

    getCapabilities(): ProviderCapabilities {
      return { supports: appleMusicManifest.supportedCapabilities };
    },

    /**
     * There is no token exchange here. Apple's developer token is minted
     * out of band by whoever holds the signing key, and the user token
     * comes from MusicKit in the browser — this connector receives both
     * and validates their presence rather than obtaining them.
     */
    async authenticate(input: AuthInput): Promise<AuthSession> {
      if (input.method !== "oauth2") {
        throw new ConnectorError(
          "validation_error",
          "Apple Music only supports oauth2-style authentication.",
        );
      }

      const developerToken = input.raw.developerToken ?? config.developerToken;
      if (typeof developerToken !== "string") {
        throw new ConnectorError(
          "validation_error",
          "Apple Music needs a developer token — sign one with your Apple Developer private key.",
        );
      }

      const { musicUserToken } = input.raw;
      return {
        method: "oauth2",
        raw: {
          developerToken,
          // Optional: catalogue reads and search work without it; only
          // a listener's own library needs one.
          ...(typeof musicUserToken === "string" ? { musicUserToken } : {}),
        },
      };
    },

    /**
     * Developer tokens are signed with an expiry and cannot be renewed
     * from a token — a new one has to be signed with the private key,
     * which this package never has. Returning the session unchanged is
     * honest; the alternative would be pretending to refresh.
     */
    async refreshAuthentication(session: AuthSession): Promise<AuthSession> {
      return session;
    },

    /** Apple has no server-side revoke endpoint — the same real limitation Spotify has. */
    async revokeAuthentication(): Promise<void> {
      // Intentionally a no-op.
    },

    async getProfile(session: AuthSession): Promise<ProviderProfile> {
      if (typeof session.raw.musicUserToken !== "string") {
        throw new ConnectorError(
          "authorization_error",
          "Reading an Apple Music profile needs a Music-User-Token from MusicKit.",
        );
      }
      // Apple exposes storefront rather than a name or email; reporting
      // the storefront id is the most identity this API actually gives.
      const response = await http.request<AppleResponse<{ id: string }>>(session, "/me/storefront");
      const id = response.data[0]?.id ?? storefront;
      return { id, displayName: `Apple Music (${id})` };
    },

    async getPlaylist(session: AuthSession, playlistId: string): Promise<Playlist> {
      const response = await http.request<AppleResponse<ApplePlaylist>>(
        session,
        `/catalog/${storefront}/playlists/${encodeURIComponent(playlistId)}`,
      );

      const playlist = response.data[0];
      if (!playlist) {
        throw new ConnectorError("not_found", `Apple Music playlist ${playlistId} was not found.`);
      }
      return normalizePlaylist(playlist);
    },

    async searchTracks(session: AuthSession, query: SearchQuery): Promise<Page<Track>> {
      // ISRC gets its own endpoint and is exact, so it is tried first —
      // the matching engine's whole strategy is identifier-before-text
      // (CLAUDE.md §10.2), and a text search for a track that has an
      // ISRC would be throwing away the strongest signal available.
      if (query.isrc) {
        const byIsrc = await http.request<AppleResponse<AppleSong>>(
          session,
          `/catalog/${storefront}/songs?filter[isrc]=${encodeURIComponent(query.isrc)}`,
        );
        if (byIsrc.data.length > 0) {
          return { items: byIsrc.data.map(normalizeTrack) };
        }
      }

      if (!query.text) return { items: [] };

      const response = await http.request<AppleSearchResponse>(
        session,
        `/catalog/${storefront}/search?types=songs&limit=25&term=${encodeURIComponent(query.text)}`,
      );
      return { items: (response.results?.songs?.data ?? []).map(normalizeTrack) };
    },
  };
}
