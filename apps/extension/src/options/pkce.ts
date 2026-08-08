/**
 * Authorization Code with PKCE (RFC 7636) — no client secret involved,
 * appropriate for a public client like this extension. See ADR-0014 and
 * ADR-0020. `packages/providers/spotify` only knows how to exchange the
 * resulting `code`; generating the verifier/challenge and running the
 * redirect is this extension's job.
 */

const VERIFIER_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";

/** 64 random characters — comfortably within RFC 7636's 43-128 range. */
export function generateCodeVerifier(): string {
  const bytes = new Uint8Array(64);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => VERIFIER_CHARS[byte % VERIFIER_CHARS.length]).join("");
}

function base64UrlEncode(bytes: ArrayBuffer): string {
  const binary = String.fromCharCode(...new Uint8Array(bytes));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function computeCodeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64UrlEncode(digest);
}

export interface AuthorizeUrlParams {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  scope: string;
}

/**
 * Read-only scopes only (CLAUDE.md §12.2) — matching what
 * `@ekusupo/provider-spotify` actually implements today; write scopes
 * would be a request for a permission nothing here uses.
 */
export const SPOTIFY_SCOPES =
  "user-read-private user-read-email playlist-read-private playlist-read-collaborative";

export function buildAuthorizeUrl(params: AuthorizeUrlParams): string {
  const url = new URL("https://accounts.spotify.com/authorize");
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("code_challenge", params.codeChallenge);
  url.searchParams.set("scope", params.scope);
  return url.toString();
}
