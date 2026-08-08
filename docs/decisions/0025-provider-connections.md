# ADR-0025: Provider Connections (Web Dashboard)

Status: Accepted

## Context

`services/api` has real auth (ADR-0022) and a real database (ADR-0024).
The next real feature CLAUDE.md §4.4 calls for is "connect provider
account" — the thing `apps/extension`'s ADR-0012/0014/0019/0020 already
solved once, for a public client (a browser extension, which can't hold
a secret and needed PKCE). `services/api` is a different kind of client:
a real backend, which **can** hold a secret safely. That changes the
right OAuth flow, not just the implementation details.

## Decision

1. **Classic Authorization Code flow, not PKCE.** `services/api` is a
   confidential client. `packages/providers/spotify`'s original
   (pre-ADR-0019) flow — Basic auth with `clientId:clientSecret` — is
   exactly right here; PKCE was only ever needed because the extension
   _can't_ hold a secret.
2. **`provider_connections` table**: `(user_id, provider)` unique,
   `encrypted_tokens` (never plaintext), `connected_at`. One row per
   user per provider — reconnecting overwrites via `upsert`
   (`ON CONFLICT DO UPDATE`), not a new row.
3. **AES-256-GCM via `node:crypto`, not a new dependency** — same
   reasoning as ADR-0022's password hashing: no native bindings, and
   authenticated encryption (a tampered payload fails to decrypt, not
   silently returns garbage) is the right primitive for CLAUDE.md
   §12.1's "encrypted at rest" requirement. Key comes from
   `PROVIDER_TOKEN_ENCRYPTION_KEY` (32 bytes, hex), an env var, never
   committed (§12.3) — `encryptTokens`/`decryptTokens` throw a clear
   error rather than silently proceeding if it's missing.
4. **Double-submit-cookie CSRF protection on the OAuth callback.** The
   session cookie alone isn't enough: without a `state` check, an
   attacker could start their own Spotify authorization, then trick a
   victim into visiting the resulting callback URL while signed into
   _their_ Ekusupo session — linking the attacker's Spotify account to
   the victim's account (a real, known OAuth flow vulnerability class,
   "login/account-linking CSRF"). A random `state`, set as an
   `ekusupo_oauth_state` cookie scoped to the callback path, checked
   against the `state` query param, closes this without needing any new
   server-side storage.
5. **`/providers/spotify/connect` fails with a clear 400** when
   `SPOTIFY_CLIENT_ID`/`SPOTIFY_REDIRECT_URI` aren't configured, rather
   than redirecting to a broken Spotify URL or silently no-opping — the
   same "honest failure over fabricated success" choice ADR-0012 made
   for the extension's equivalent gap.
6. **The Spotify provider factory is injectable**
   (`createSpotifyProviderImpl`, defaulting to the real
   `createSpotifyProvider`) — the same reasoning as every `fetchImpl`
   injection point elsewhere in this repo. This is what let the full
   successful-exchange path (`connect` → `callback` → session saved →
   shows up in `GET /providers`) get a real test without a live network
   call, not just the failure paths.
7. **Read-only scopes only** (CLAUDE.md §12.2) — matches what
   `@ekusupo/provider-spotify` actually implements; requesting write
   scopes now would be asking for a permission nothing here uses.

## What this still doesn't solve

**A real Spotify Client ID/Secret.** Exactly like ADR-0014/ADR-0020 for
the extension: registering a Spotify Developer app is the user's own
action, not something this repository can do. Verified with a real
running server that `/providers/spotify/connect` genuinely redirects to
Spotify's real authorize endpoint with correct parameters — but nothing
here has ever completed, or can complete, a real token exchange against
Spotify's real servers, because that needs real credentials this
environment doesn't have.

## Consequences

- `services/api` can now store a real provider connection, encrypted,
  tied to a signed-in user, with a real foreign key to `users` (deleting
  a user cascades to their connections, same as sessions).
- `GET /providers`/`DELETE /providers/:provider` give the web app
  (ADR-0023's next step) something real to build a "Connected Providers"
  screen against.
- `ProviderConnectionService.getSession()` returns a real, decrypted
  `AuthSession` — exactly the shape the Transfer Engine wiring (next)
  needs to actually call `runDryRunTransfer`/`runLiveTransfer` with a
  connected user's real provider.

## Alternatives Considered

- **Reuse the extension's PKCE flow for the web app too**, for
  consistency. Rejected — `services/api` isn't a public client, so PKCE
  would be solving a problem it doesn't have while leaving the classic
  flow (which `packages/providers/spotify` already implements, unchanged
  since v0.1) unused for the one context it was actually designed for.
- **Skip the `state` CSRF check** since the callback already requires an
  authenticated session. Rejected — the session check alone doesn't stop
  the account-linking attack described above; the two checks protect
  against different things.
