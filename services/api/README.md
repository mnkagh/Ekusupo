# @ekusupo/api

The Ekusupo API layer (CLAUDE.md §4.4) — the only HTTP surface `apps/web`
and, eventually, `apps/extension` talk to for anything requiring a
server: connecting a provider account, starting a transfer, reading
history. See `docs/decisions/0021-web-dashboard-and-api-scaffolding.md`
for the build-tooling rationale.

## Status

- `GET /health`.
- Real auth: `POST /auth/sign-up`, `POST /auth/sign-in`,
  `POST /auth/sign-out`, `GET /auth/me` — session cookies, real password
  hashing (`docs/decisions/0022-web-dashboard-auth-v1.md`).
- Real provider connections: `GET /providers`,
  `GET /providers/spotify/connect`, `GET /providers/spotify/callback`,
  `DELETE /providers/:provider` — real Spotify OAuth (classic
  Authorization Code flow), tokens encrypted at rest
  (`docs/decisions/0025-provider-connections.md`). Needs your own
  Spotify Developer app to actually complete a connection — see below.

All of it backed by a real Postgres database
(`docs/decisions/0024-postgres-via-pglite.md` — `pglite`, an embedded
real Postgres, since this environment has no Docker or installed
Postgres server; a hosted Postgres later is a same-schema driver swap,
not implemented/verified yet). Data persists across restarts in
`services/api/data/` (gitignored).

## Running it

```sh
cp .env.example .env   # fill in PROVIDER_TOKEN_ENCRYPTION_KEY at minimum
pnpm --filter @ekusupo/api dev
```

Runs on `PORT` (default `3000`) via `tsx watch`, storing data in
`DATABASE_PATH` (default `./data/ekusupo-db`, created automatically).
Delete that directory to reset to a clean database. `pnpm --filter
@ekusupo/api build` (part of the root `tsc -b`) then `pnpm --filter
@ekusupo/api start` runs the compiled output.

### Connecting a real Spotify account

1. Generate an encryption key and put it in `.env`:
   `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`
2. Register an app at <https://developer.spotify.com/dashboard>, add
   `http://localhost:3000/providers/spotify/callback` as a redirect URI.
3. Put the app's Client ID/Secret in `.env` as `SPOTIFY_CLIENT_ID` /
   `SPOTIFY_CLIENT_SECRET`.
4. With `apps/web` also running, sign in, then visit
   `http://localhost:3000/providers/spotify/connect` — it redirects to a
   real Spotify login/consent screen.

Without steps 2–3, `/providers/spotify/connect` returns a clear 400
instead of pretending to work.
