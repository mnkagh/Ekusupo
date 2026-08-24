import type { AuthSession, MusicProvider } from "@ekusupo/connector-sdk";
import { createSpotifyProvider } from "@ekusupo/provider-spotify";
import { createDeezerProvider } from "@ekusupo/provider-deezer";
import { createYouTubeMusicProvider } from "@ekusupo/provider-youtube-music";

/**
 * How a provider is connected.
 *
 * One shape today: a redirect to the provider, then a callback carrying
 * a code the server exchanges for tokens. Kept as a named field rather
 * than assumed, because it is what clients read to decide which
 * connect affordance to show — but there is deliberately no second
 * member. A `serverToken` mode existed for Apple Music, whose catalogue
 * was read with a developer token signed out of band; with that
 * provider gone, nothing implemented it, and an unimplemented branch is
 * worse than an absent one.
 */
export type ProviderAuthKind = "oauth2" | "none";

export interface ProviderCredentials {
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
}

export interface ProviderDefinition {
  id: string;
  displayName: string;
  authKind: ProviderAuthKind;
  /** Builds the provider instance used for reads and transfers. */
  createProvider: (credentials: ProviderCredentials) => MusicProvider;
  /** oauth2 only: where to send the browser. */
  buildAuthorizeUrl?: (credentials: ProviderCredentials, state: string) => string;
  /** oauth2 only: turns the callback code into a session. */
  exchangeCode?: (credentials: ProviderCredentials, code: string) => Promise<AuthSession>;
  /** Names the env vars an operator must set, for error messages. */
  requiredEnv: string[];
  /** Reports whether this provider is usable with the credentials given. */
  isConfigured: (credentials: ProviderCredentials) => boolean;
}

const SPOTIFY_SCOPES = [
  "user-read-private",
  "user-read-email",
  "playlist-read-private",
  "playlist-read-collaborative",
].join(" ");

/**
 * Widened from `youtube.readonly` now that Live Transfer genuinely ships
 * (ADR-0032) — exactly the condition ADR-0029 set for widening it, and
 * not a moment earlier. `youtube` is the narrowest scope Google offers
 * that permits `playlists.insert` and `playlistItems.insert`; there is no
 * playlist-only write scope to request instead.
 *
 * Anyone who connected YouTube Music before this change holds a
 * read-only token and must reconnect before it can be a destination.
 * Google will refuse the write with a 403, which the transfer report
 * surfaces rather than swallowing.
 */
const YOUTUBE_SCOPES = ["https://www.googleapis.com/auth/youtube"].join(" ");

export const PROVIDER_DEFINITIONS: ProviderDefinition[] = [
  {
    id: "deezer",
    displayName: "Deezer",
    authKind: "none",
    requiredEnv: [],
    isConfigured: () => true,
    createProvider: () => createDeezerProvider(),
  },
  {
    id: "spotify",
    displayName: "Spotify",
    authKind: "oauth2",
    requiredEnv: ["SPOTIFY_CLIENT_ID", "SPOTIFY_CLIENT_SECRET", "SPOTIFY_REDIRECT_URI"],
    isConfigured: (c) => Boolean(c.clientId && c.clientSecret && c.redirectUri),
    createProvider: (c) =>
      createSpotifyProvider({ clientId: c.clientId, clientSecret: c.clientSecret }),
    buildAuthorizeUrl: (c, state) => {
      const params = new URLSearchParams({
        client_id: c.clientId ?? "",
        response_type: "code",
        redirect_uri: c.redirectUri ?? "",
        state,
        scope: SPOTIFY_SCOPES,
      });
      return `https://accounts.spotify.com/authorize?${params.toString()}`;
    },
    exchangeCode: (c, code) =>
      createSpotifyProvider({ clientId: c.clientId, clientSecret: c.clientSecret }).authenticate({
        method: "oauth2",
        raw: { code, redirectUri: c.redirectUri },
      }),
  },
  {
    id: "youtube-music",
    displayName: "YouTube Music",
    authKind: "oauth2",
    requiredEnv: ["YOUTUBE_CLIENT_ID", "YOUTUBE_CLIENT_SECRET", "YOUTUBE_REDIRECT_URI"],
    isConfigured: (c) => Boolean(c.clientId && c.clientSecret && c.redirectUri),
    createProvider: () => createYouTubeMusicProvider(),
    buildAuthorizeUrl: (c, state) => {
      const params = new URLSearchParams({
        client_id: c.clientId ?? "",
        response_type: "code",
        redirect_uri: c.redirectUri ?? "",
        state,
        scope: YOUTUBE_SCOPES,
        // Google returns a refresh token only on the first consent
        // unless both are set — without them a reconnect silently yields
        // an access token that expires in an hour and cannot be renewed.
        access_type: "offline",
        prompt: "consent",
      });
      return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    },
    exchangeCode: async (c, code) => {
      const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: c.clientId ?? "",
          client_secret: c.clientSecret ?? "",
          redirect_uri: c.redirectUri ?? "",
          grant_type: "authorization_code",
        }),
      });
      if (!response.ok) {
        throw new Error(`Google token exchange failed with ${response.status}`);
      }
      const token = (await response.json()) as { access_token: string; refresh_token?: string };
      return {
        method: "oauth2",
        raw: {
          accessToken: token.access_token,
          ...(token.refresh_token ? { refreshToken: token.refresh_token } : {}),
        },
      };
    },
  },
];

export function findProvider(id: string): ProviderDefinition | undefined {
  return PROVIDER_DEFINITIONS.find((definition) => definition.id === id);
}
