import type { AuthSession, MusicProvider } from "@ekusupo/connector-sdk";
import { createAppleMusicProvider } from "@ekusupo/provider-apple-music";
import { createSpotifyProvider } from "@ekusupo/provider-spotify";
import { createYouTubeMusicProvider } from "@ekusupo/provider-youtube-music";

/**
 * How a provider is connected. The two shapes differ enough that a
 * single code path cannot serve both honestly:
 *
 * - `oauth2` — a redirect to the provider, then a callback carrying a
 *   code the server exchanges for tokens. Spotify and YouTube.
 * - `serverToken` — no user redirect at all. Apple Music's catalogue is
 *   read with a developer token the operator signs out of band, so
 *   "connecting" is a server-side capability check, not a login.
 */
export type ProviderAuthKind = "oauth2" | "serverToken";

export interface ProviderCredentials {
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
  /** Apple only: the signed JWT identifying the app. */
  developerToken?: string;
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
  /** serverToken only: builds the session from server configuration. */
  buildServerSession?: (credentials: ProviderCredentials) => Promise<AuthSession>;
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
 * Read-only, and only what is actually used. `youtube.readonly` alone
 * would block playlist creation later, but requesting write access the
 * product cannot yet perform would violate least privilege (CLAUDE.md
 * §12.2) — the scope widens when Live Transfer ships, not before.
 */
const YOUTUBE_SCOPES = ["https://www.googleapis.com/auth/youtube.readonly"].join(" ");

export const PROVIDER_DEFINITIONS: ProviderDefinition[] = [
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
  {
    id: "apple-music",
    displayName: "Apple Music",
    authKind: "serverToken",
    requiredEnv: ["APPLE_MUSIC_DEVELOPER_TOKEN"],
    isConfigured: (c) => Boolean(c.developerToken),
    createProvider: (c) => createAppleMusicProvider({ developerToken: c.developerToken }),
    buildServerSession: async (c) => ({
      method: "oauth2",
      // Catalogue-only. Reaching a listener's own library additionally
      // needs a Music-User-Token from MusicKit in the browser, which
      // this flow deliberately does not attempt to obtain.
      raw: { developerToken: c.developerToken ?? "" },
    }),
  },
];

export function findProvider(id: string): ProviderDefinition | undefined {
  return PROVIDER_DEFINITIONS.find((definition) => definition.id === id);
}
