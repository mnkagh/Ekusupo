import type { sendToBackground } from "../shared/message-bus.js";
import {
  buildAuthorizeUrl,
  computeCodeChallenge,
  generateCodeVerifier,
  SPOTIFY_SCOPES,
} from "./pkce.js";

/**
 * No `chrome.*` dependency — every browser-specific call is injected, the
 * same "untested glue, tested logic underneath" split already used for
 * `content-script.ts` and `background/transfer-orchestrator.ts`.
 */
export interface ConnectSpotifyDeps {
  launchWebAuthFlow: (details: {
    url: string;
    interactive: boolean;
  }) => Promise<string | undefined>;
  getRedirectURL: () => string;
  authenticate: typeof sendToBackground;
}

/**
 * Runs the full PKCE dance (ADR-0014, ADR-0020) and asks background to
 * exchange the resulting code. Returns whether the connection succeeded;
 * never throws for an auth failure — the same "report, don't throw"
 * convention `@ekusupo/core`'s Transfer Engine uses for its own failures.
 */
export async function connectSpotify(clientId: string, deps: ConnectSpotifyDeps): Promise<boolean> {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await computeCodeChallenge(codeVerifier);
  const redirectUri = deps.getRedirectURL();

  const authorizeUrl = buildAuthorizeUrl({
    clientId,
    redirectUri,
    codeChallenge,
    scope: SPOTIFY_SCOPES,
  });

  const responseUrl = await deps.launchWebAuthFlow({ url: authorizeUrl, interactive: true });
  if (!responseUrl) return false;

  const code = new URL(responseUrl).searchParams.get("code");
  if (!code) return false;

  const result = await deps.authenticate("AuthenticateProvider", {
    provider: "spotify",
    code,
    redirectUri,
    codeVerifier,
    clientId,
  });
  return result.connected;
}
