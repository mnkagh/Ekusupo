# @ekusupo/api

The Ekusupo API layer (CLAUDE.md §4.4) — the only HTTP surface `apps/web`
and, eventually, `apps/extension` talk to for anything requiring a
server: connecting a provider account, starting a transfer, reading
history. See `docs/decisions/0021-web-dashboard-and-api-scaffolding.md`
for the build-tooling rationale.

## Status

`GET /health`, plus real auth: `POST /auth/sign-up`, `POST /auth/sign-in`,
`POST /auth/sign-out`, `GET /auth/me` — session cookies, real password
hashing, backed by a real Postgres database (`docs/decisions/0024-postgres-via-pglite.md`
— `pglite`, an embedded real Postgres, since this environment has no
Docker or installed Postgres server; a hosted Postgres later is a
same-schema driver swap, not implemented/verified yet). Data persists
across restarts in `services/api/data/` (gitignored).

## Running it

```sh
pnpm --filter @ekusupo/api dev
```

Runs on `PORT` (default `3000`) via `tsx watch`, storing data in
`DATABASE_PATH` (default `./data/ekusupo-db`, created automatically).
Delete that directory to reset to a clean database. `pnpm --filter
@ekusupo/api build` (part of the root `tsc -b`) then `pnpm --filter
@ekusupo/api start` runs the compiled output.
