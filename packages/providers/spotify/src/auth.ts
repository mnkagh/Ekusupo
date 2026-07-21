import { ConnectorError } from "@ekusupo/connector-sdk";
import type { AuthInput, AuthSession } from "@ekusupo/connector-sdk";

import { mapSpotifyHttpError } from "./http.js";
import type { SpotifyTokenResponse } from "./types.js";

const TOKEN_URL = "https://accounts.spotify.com/api/token";

export interface SpotifyAuthConfig {
  clientId?: string;
  clientSecret?: string;
  fetchImpl?: typeof fetch;
}

function computeExpiresAt(expiresInSeconds: number): string {
  return new Date(Date.now() + expiresInSeconds * 1000).toISOString();
}

async function exchangeToken(
  config: SpotifyAuthConfig,
  body: URLSearchParams,
): Promise<AuthSession> {
  const fetchImpl = config.fetchImpl ?? fetch;
  const credentials = `${config.clientId ?? ""}:${config.clientSecret ?? ""}`;

  const response = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${btoa(credentials)}`,
    },
    body,
  });

  if (!response.ok) {
    throw mapSpotifyHttpError(response);
  }

  const token = (await response.json()) as SpotifyTokenResponse;

  return {
    method: "oauth2",
    raw: {
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
    },
    expiresAt: computeExpiresAt(token.expires_in),
  };
}

/**
 * Expects an authorization `code` already obtained via a redirect UI —
 * that UI flow is explicitly out of scope for this package (Phase 3C).
 */
export async function authenticate(
  config: SpotifyAuthConfig,
  input: AuthInput,
): Promise<AuthSession> {
  if (input.method !== "oauth2") {
    throw new ConnectorError("validation_error", "Spotify only supports oauth2 authentication.");
  }

  const { code, redirectUri } = input.raw;
  if (typeof code !== "string" || typeof redirectUri !== "string") {
    throw new ConnectorError(
      "validation_error",
      "AuthInput.raw must include an already-obtained authorization `code` and `redirectUri`.",
    );
  }

  return exchangeToken(
    config,
    new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri }),
  );
}

export async function refreshAuthentication(
  config: SpotifyAuthConfig,
  session: AuthSession,
): Promise<AuthSession> {
  const { refreshToken } = session.raw;
  if (typeof refreshToken !== "string") {
    throw new ConnectorError("authentication_error", "Session has no refresh token to use.");
  }

  return exchangeToken(
    config,
    new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
  );
}

/**
 * Spotify's Web API has no server-side token-revoke endpoint — a real-world
 * limitation the contract accommodates gracefully: this still resolves, it
 * just has nothing to call. See docs/connector-sdk.md's provider lifecycle.
 */
export async function revokeAuthentication(): Promise<void> {
  // Intentionally a no-op.
}
