import { ConnectorError } from "@ekusupo/connector-sdk";
import type {
  AuthInput,
  AuthSession,
  CreatePlaylistInput,
  MusicProvider,
  Page,
  ProviderCapabilities,
  ProviderProfile,
  SearchQuery,
} from "@ekusupo/connector-sdk";
import type { Playlist, Track } from "@ekusupo/upf";

import { createYouTubeHttpClient } from "./http.js";
import { youtubeMusicManifest } from "./manifest.js";
import { normalizePlaylist, normalizeSearchItem } from "./normalize.js";
import type {
  YouTubeChannel,
  YouTubeListResponse,
  YouTubePlaylist,
  YouTubePlaylistItem,
  YouTubeSearchItem,
} from "./types.js";

export interface YouTubeMusicProviderConfig {
  fetchImpl?: typeof fetch;
  apiBaseUrl?: string;
  /** Page size for playlist reads. YouTube's maximum is 50. */
  pageSize?: number;
}

const MAX_PAGE_SIZE = 50;

/**
 * YouTube Music via the **YouTube Data API v3**.
 *
 * The first connector in this repo that can write: the Data API really
 * does support creating a playlist and inserting items, so this is the
 * first provider capable of being a Live Transfer destination rather
 * than only a source.
 *
 * Two honest limitations, both consequences of the API rather than of
 * this implementation:
 *
 * - **No ISRC.** The Data API does not expose one, so matching against
 *   YouTube falls back to title and artist text, which is weaker than
 *   the identifier-first path Spotify and Apple support (CLAUDE.md
 *   §10.2). Transfers *into* YouTube will produce lower-confidence
 *   matches, and that is a property of the source data, not a bug.
 * - **Titles are video titles.** "Artist - Title (Official Video)" is
 *   parsed rather than read from structured fields — see
 *   `normalize.ts`.
 */
export function createYouTubeMusicProvider(config: YouTubeMusicProviderConfig = {}): MusicProvider {
  const http = createYouTubeHttpClient({
    fetchImpl: config.fetchImpl,
    apiBaseUrl: config.apiBaseUrl,
  });
  const pageSize = Math.min(config.pageSize ?? MAX_PAGE_SIZE, MAX_PAGE_SIZE);

  return {
    manifest: youtubeMusicManifest,

    getCapabilities(): ProviderCapabilities {
      return { supports: youtubeMusicManifest.supportedCapabilities };
    },

    /**
     * Google's OAuth exchange happens outside this package — the same
     * split the Spotify connector uses, and the same reason: the token
     * endpoint needs a client secret that belongs on a server.
     */
    async authenticate(input: AuthInput): Promise<AuthSession> {
      if (input.method !== "oauth2") {
        throw new ConnectorError(
          "validation_error",
          "YouTube only supports oauth2 authentication.",
        );
      }
      const { accessToken, refreshToken } = input.raw;
      if (typeof accessToken !== "string") {
        throw new ConnectorError(
          "validation_error",
          "AuthInput.raw must include an already-obtained Google accessToken.",
        );
      }
      return {
        method: "oauth2",
        raw: { accessToken, ...(typeof refreshToken === "string" ? { refreshToken } : {}) },
      };
    },

    async refreshAuthentication(session: AuthSession): Promise<AuthSession> {
      // Refreshing needs the client secret, which lives on the server —
      // returning the session unchanged is honest rather than pretending.
      return session;
    },

    async revokeAuthentication(): Promise<void> {
      // Google has a revoke endpoint, but it takes the client credentials
      // this package deliberately never holds.
    },

    async getProfile(session: AuthSession): Promise<ProviderProfile> {
      const response = await http.request<YouTubeListResponse<YouTubeChannel>>(
        session,
        "/channels?part=snippet&mine=true",
      );
      const channel = response.items?.[0];
      if (!channel) {
        throw new ConnectorError("not_found", "No YouTube channel found for this account.");
      }
      return { id: channel.id, displayName: channel.snippet?.title };
    },

    async getPlaylist(session: AuthSession, playlistId: string): Promise<Playlist> {
      const meta = await http.request<YouTubeListResponse<YouTubePlaylist>>(
        session,
        `/playlists?part=snippet,status&id=${encodeURIComponent(playlistId)}`,
      );
      const playlist = meta.items?.[0];
      if (!playlist) {
        throw new ConnectorError("not_found", `YouTube playlist ${playlistId} was not found.`);
      }

      // Playlist items are paged, and a music playlist very often runs
      // past one page — stopping at the first would silently truncate
      // the transfer, which is worse than being slow.
      const items: YouTubePlaylistItem[] = [];
      let pageToken: string | undefined;
      do {
        const page: YouTubeListResponse<YouTubePlaylistItem> = await http.request(
          session,
          `/playlistItems?part=snippet&maxResults=${pageSize}&playlistId=${encodeURIComponent(playlistId)}${
            pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""
          }`,
        );
        items.push(...(page.items ?? []));
        pageToken = page.nextPageToken;
      } while (pageToken);

      return normalizePlaylist(playlist, items);
    },

    async searchTracks(session: AuthSession, query: SearchQuery): Promise<Page<Track>> {
      if (!query.text) return { items: [] };

      // `videoCategoryId=10` is YouTube's Music category. Without it the
      // search returns interviews, reactions and lyric compilations
      // alongside the track, which the matching engine would then have
      // to reject one by one.
      const response = await http.request<YouTubeListResponse<YouTubeSearchItem>>(
        session,
        `/search?part=snippet&type=video&videoCategoryId=10&maxResults=25&q=${encodeURIComponent(query.text)}`,
      );
      return { items: (response.items ?? []).map(normalizeSearchItem) };
    },

    async createPlaylist(session: AuthSession, draft: CreatePlaylistInput): Promise<Playlist> {
      const created = await http.post<YouTubePlaylist>(session, "/playlists?part=snippet,status", {
        snippet: { title: draft.title, description: draft.description },
        status: {
          // Defaults to private: a transfer should never make someone's
          // library public as a side effect of an unspecified field.
          privacyStatus: draft.privacy === "public" ? "public" : "private",
        },
      });
      return normalizePlaylist(created, []);
    },

    async addTracksToPlaylist(
      session: AuthSession,
      playlistId: string,
      tracks: Track[],
    ): Promise<Playlist> {
      // One request per item: playlistItems.insert takes a single item,
      // with no batch form. Sequential rather than parallel on purpose —
      // firing 50 concurrent writes is the fastest way to hit the quota
      // error this connector maps as retryable.
      for (const track of tracks) {
        const videoId = track.providerRefs?.["youtube-music"]?.id ?? track.id;
        if (!videoId) continue;

        await http.post(session, "/playlistItems?part=snippet", {
          snippet: {
            playlistId,
            resourceId: { kind: "youtube#video", videoId },
          },
        });
      }

      // The contract returns the resulting playlist, so it is re-read
      // rather than assembled locally — YouTube assigns item ids and
      // positions, and inventing them here would produce a Playlist that
      // does not match what the destination actually holds.
      return this.getPlaylist!(session, playlistId);
    },
  };
}
