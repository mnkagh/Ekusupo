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

/**
 * Confidential-client auth (a `clientSecret` is configured — e.g. a
 * future server-side `services/api`) uses Basic auth, unchanged from
 * v0.1. A public client (no `clientSecret` — e.g. the browser extension,
 * which cannot safely hold one; ADR-0014/ADR-0019) sends no
 * `Authorization` header at all and puts `client_id` in the body instead
 * — Authorization Code with PKCE, RFC 7636.
 */
async function exchangeToken(
  config: SpotifyAuthConfig,
  body: URLSearchParams,
): Promise<AuthSession> {
  const fetchImpl = config.fetchImpl ?? fetch;
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
  };

  if (config.clientSecret) {
    headers.Authorization = `Basic ${btoa(`${config.clientId ?? ""}:${config.clientSecret}`)}`;
  } else if (config.clientId) {
    body.set("client_id", config.clientId);
  }

  const response = await fetchImpl(TOKEN_URL, { method: "POST", headers, body });

  if (!response.ok) {
    throw mapSpotifyHttpError(response);
  }

  // A 200 whose body is not a token (a misbehaving proxy, a captive
  // portal, an API change) must surface as a connector error. Letting it
  // through used to reach `new Date(NaN).toISOString()` and throw an
  // unclassified RangeError from deep inside ISO formatting.
  let token: SpotifyTokenResponse;
  try {
    token = (await response.json()) as SpotifyTokenResponse;
  } catch {
    throw new ConnectorError(
      "provider_unavailable",
      "Spotify's token endpoint answered successfully, but its body was not a token.",
      { retryable: false },
    );
  }
  if (
    typeof token?.access_token !== "string" ||
    token.access_token.length === 0 ||
    typeof token?.expires_in !== "number" ||
    !Number.isFinite(token.expires_in) ||
    token.expires_in <= 0
  ) {
    throw new ConnectorError(
      "provider_unavailable",
      "Spotify's token endpoint answered successfully, but without the fields a token needs.",
      { retryable: false },
    );
  }

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
 *
 * When `config.clientSecret` isn't set, `input.raw` must also include a
 * PKCE `codeVerifier` (the counterpart to the `code_challenge` the
 * redirect UI sent when starting the flow) — see ADR-0019.
 */
export async function authenticate(
  config: SpotifyAuthConfig,
  input: AuthInput,
): Promise<AuthSession> {
  if (input.method !== "oauth2") {
    throw new ConnectorError("validation_error", "Spotify only supports oauth2 authentication.");
  }

  const { code, redirectUri, codeVerifier } = input.raw;
  if (typeof code !== "string" || typeof redirectUri !== "string") {
    throw new ConnectorError(
      "validation_error",
      "AuthInput.raw must include an already-obtained authorization `code` and `redirectUri`.",
    );
  }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });

  if (!config.clientSecret) {
    if (typeof codeVerifier !== "string") {
      throw new ConnectorError(
        "validation_error",
        "AuthInput.raw must include `codeVerifier` when no clientSecret is configured (PKCE) — see ADR-0019.",
      );
    }
    body.set("code_verifier", codeVerifier);
  }

  return exchangeToken(config, body);
}

/**
 * The Client Credentials grant: an *app-level* token, with no user and
 * no login. It can read public catalog data — a public playlist, an
 * album, a track — and nothing belonging to any particular listener.
 *
 * This is what makes "paste a public playlist link" work without asking
 * anyone to connect an account. It is still an authenticated call:
 * Spotify has no anonymous API, so the server must hold a client ID and
 * secret. What disappears is the *user's* involvement, not the
 * credential.
 *
 * Confidential clients only — the grant requires a `clientSecret`, so a
 * browser extension (ADR-0019's public client) cannot use it.
 *
 * The returned session carries `appOnly: true` so callers can tell it
 * apart from a user session and explain a failure correctly: a private
 * playlist read with this token is not "not found", it is "you need to
 * connect your account".
 */
export async function authenticateAsApp(config: SpotifyAuthConfig): Promise<AuthSession> {
  if (!config.clientId || !config.clientSecret) {
    throw new ConnectorError(
      "validation_error",
      "The Client Credentials grant needs both a clientId and a clientSecret.",
    );
  }

  const session = await exchangeToken(
    config,
    new URLSearchParams({ grant_type: "client_credentials" }),
  );
  return { ...session, raw: { ...session.raw, appOnly: true } };
}

export async function refreshAuthentication(
  config: SpotifyAuthConfig,
  session: AuthSession,
): Promise<AuthSession> {
  const { refreshToken } = session.raw;
  if (typeof refreshToken !== "string") {
    throw new ConnectorError("authentication_error", "Session has no refresh token to use.");
  }

  const refreshed = await exchangeToken(
    config,
    new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
  );

  // RFC 6749 §6: a refresh response MAY omit `refresh_token`, and
  // Spotify's does for confidential clients. The token just used remains
  // valid — carrying it forward is the difference between refreshing
  // forever and failing on the *next* expiry with "no refresh token".
  return {
    ...refreshed,
    raw: {
      ...refreshed.raw,
      refreshToken:
        typeof refreshed.raw.refreshToken === "string" ? refreshed.raw.refreshToken : refreshToken,
    },
  };
}

/**
 * Spotify's Web API has no server-side token-revoke endpoint — a real-world
 * limitation the contract accommodates gracefully: this still resolves, it
 * just has nothing to call. See docs/connector-sdk.md's provider lifecycle.
 */
export async function revokeAuthentication(): Promise<void> {
  // Intentionally a no-op.
}
