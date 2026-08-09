import { randomBytes } from "node:crypto";

import { createSpotifyProvider } from "@ekusupo/provider-spotify";
import type { FastifyInstance } from "fastify";

import type { AuthService } from "../auth/auth-service.js";
import { requireAuth } from "../auth/session-cookie.js";
import { ProviderConnectionService } from "../providers/provider-connection-service.js";
import type { ProviderConnectionStore } from "../providers/provider-connection-store.js";
import { buildSpotifyAuthorizeUrl } from "../providers/spotify-oauth.js";

const OAUTH_STATE_COOKIE = "ekusupo_oauth_state";
const OAUTH_CALLBACK_PATH = "/providers/spotify/callback";

export interface ProviderRoutesConfig {
  spotifyClientId?: string;
  spotifyClientSecret?: string;
  spotifyRedirectUri?: string;
  webAppUrl?: string;
}

export interface ProviderRoutesDeps {
  authService: AuthService;
  providerConnectionStore: ProviderConnectionStore;
  config?: ProviderRoutesConfig;
  /** Injectable, same pattern as `createSpotifyProvider`'s own `fetchImpl` — lets tests exercise the full exchange without a live network call. */
  createSpotifyProviderImpl?: typeof createSpotifyProvider;
}

/**
 * Real Spotify OAuth (classic Authorization Code flow — ADR-0025), plus
 * connect/disconnect for a signed-in user. `spotifyClientId`/`Secret`
 * are unset by default; `/providers/spotify/connect` fails with a clear
 * 400 rather than redirecting to a broken URL when they aren't
 * configured — no fabricated credential, no silent no-op.
 */
export function registerProviderRoutes(app: FastifyInstance, deps: ProviderRoutesDeps): void {
  const { authService, providerConnectionStore } = deps;
  const config = deps.config ?? {};
  const webAppUrl = config.webAppUrl ?? "http://localhost:5173";
  const connectionService = new ProviderConnectionService(providerConnectionStore);
  const makeSpotifyProvider = deps.createSpotifyProviderImpl ?? createSpotifyProvider;

  app.get("/providers", async (request, reply) => {
    const user = await requireAuth(request, reply, authService);
    if (!user) return;
    return { providers: await connectionService.listConnections(user.id) };
  });

  app.delete<{ Params: { provider: string } }>("/providers/:provider", async (request, reply) => {
    const user = await requireAuth(request, reply, authService);
    if (!user) return;
    await connectionService.disconnect(user.id, request.params.provider);
    return { disconnected: true };
  });

  app.get("/providers/spotify/connect", async (request, reply) => {
    const user = await requireAuth(request, reply, authService);
    if (!user) return;

    if (!config.spotifyClientId || !config.spotifyRedirectUri) {
      reply.code(400);
      return {
        error:
          "Spotify isn't configured on this server (SPOTIFY_CLIENT_ID / SPOTIFY_REDIRECT_URI missing).",
      };
    }

    // Double-submit-cookie CSRF check (verified on the callback below) —
    // an attacker could otherwise link their own Spotify account to a
    // victim's Ekusupo session by tricking them into visiting a crafted
    // callback URL. The session cookie alone doesn't prevent that; this does.
    const state = randomBytes(16).toString("hex");
    reply.setCookie(OAUTH_STATE_COOKIE, state, {
      path: OAUTH_CALLBACK_PATH,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 600,
    });

    const authorizeUrl = buildSpotifyAuthorizeUrl(
      { clientId: config.spotifyClientId, redirectUri: config.spotifyRedirectUri },
      state,
    );
    return reply.redirect(authorizeUrl);
  });

  app.get<{ Querystring: { code?: string; state?: string; error?: string } }>(
    OAUTH_CALLBACK_PATH,
    async (request, reply) => {
      const user = await requireAuth(request, reply, authService);
      if (!user) return;

      const expectedState = request.cookies[OAUTH_STATE_COOKIE];
      reply.clearCookie(OAUTH_STATE_COOKIE, { path: OAUTH_CALLBACK_PATH });

      if (request.query.error) {
        return reply.redirect(
          `${webAppUrl}/?provider_error=${encodeURIComponent(request.query.error)}`,
        );
      }
      if (!request.query.code || !request.query.state || request.query.state !== expectedState) {
        reply.code(400);
        return { error: "Invalid or expired OAuth state." };
      }
      if (!config.spotifyClientId || !config.spotifyClientSecret || !config.spotifyRedirectUri) {
        reply.code(400);
        return { error: "Spotify isn't configured on this server." };
      }

      const provider = makeSpotifyProvider({
        clientId: config.spotifyClientId,
        clientSecret: config.spotifyClientSecret,
      });

      // Exchange and storage are caught separately because they fail for
      // completely different reasons and need different fixes: a failed
      // exchange means the credentials or redirect URI are wrong, while
      // failed storage means the server is misconfigured (most often a
      // missing PROVIDER_TOKEN_ENCRYPTION_KEY). Reporting both as
      // "exchange_failed" sends the user to re-check credentials that
      // were never the problem.
      let session;
      try {
        session = await provider.authenticate({
          method: "oauth2",
          raw: { code: request.query.code, redirectUri: config.spotifyRedirectUri },
        });
      } catch (error) {
        console.warn("[Ekusupo API] Spotify OAuth token exchange failed", error);
        return reply.redirect(`${webAppUrl}/?provider_error=exchange_failed`);
      }

      try {
        await connectionService.saveSession(user.id, "spotify", session);
      } catch (error) {
        console.error(
          "[Ekusupo API] Spotify authorized successfully but the connection could not be stored — check PROVIDER_TOKEN_ENCRYPTION_KEY",
          error,
        );
        return reply.redirect(`${webAppUrl}/?provider_error=storage_failed`);
      }

      return reply.redirect(`${webAppUrl}/?connected=spotify`);
    },
  );
}
