# @ekusupo/api

The Ekusupo API layer (CLAUDE.md §4.4) — the only HTTP surface `apps/web`
and, eventually, `apps/extension` talk to for anything requiring a
server: connecting a provider account, starting a transfer, reading
history. See `docs/decisions/0021-web-dashboard-and-api-scaffolding.md`
for the build-tooling rationale.

## Status

`GET /health`, plus real auth: `POST /auth/sign-up`, `POST /auth/sign-in`,
`POST /auth/sign-out`, `GET /auth/me` — session cookies, real password
hashing, backed by in-memory stores for now. See
`docs/decisions/0022-web-dashboard-auth-v1.md` for what that means and
what's still deferred (a real Postgres-backed store, `apps/web`'s
sign-in UI, password reset).

## Running it

```sh
pnpm --filter @ekusupo/api dev
```

Runs on `PORT` (default `3000`) via `tsx watch`. `pnpm --filter
@ekusupo/api build` (part of the root `tsc -b`) then `pnpm --filter
@ekusupo/api start` runs the compiled output.
