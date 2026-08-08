# @ekusupo/api

The Ekusupo API layer (CLAUDE.md §4.4) — the only HTTP surface `apps/web`
and, eventually, `apps/extension` talk to for anything requiring a
server: connecting a provider account, starting a transfer, reading
history. See `docs/decisions/0021-web-dashboard-and-api-scaffolding.md`
for the build-tooling rationale.

## Status

Foundation only: a Fastify server that starts and answers `GET /health`.
No real routes, no database, no auth — see ADR-0021's "What's deferred."

## Running it

```sh
pnpm --filter @ekusupo/api dev
```

Runs on `PORT` (default `3000`) via `tsx watch`. `pnpm --filter
@ekusupo/api build` (part of the root `tsc -b`) then `pnpm --filter
@ekusupo/api start` runs the compiled output.
