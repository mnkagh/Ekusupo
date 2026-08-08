/**
 * Classic Authorization Code flow, not PKCE — unlike `apps/extension`
 * (ADR-0014/ADR-0019/ADR-0020), `services/api` is a confidential client:
 * a real backend that can hold a client secret safely. See ADR-0025.
 */
export interface SpotifyOAuthConfig {
  clientId: string;
  redirectUri: string;
}

/** Read-only scopes only (CLAUDE.md §12.2) — matches what `@ekusupo/provider-spotify` implements. */
export const SPOTIFY_SCOPES =
  "user-read-private user-read-email playlist-read-private playlist-read-collaborative";

export function buildSpotifyAuthorizeUrl(config: SpotifyOAuthConfig, state: string): string {
  const url = new URL("https://accounts.spotify.com/authorize");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("scope", SPOTIFY_SCOPES);
  return url.toString();
}
