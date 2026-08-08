# ADR-0024: Real Postgres via `pglite`

Status: Accepted

## Context

ADR-0022 deliberately kept `UserStore`/`SessionStore` in-memory, reasoning
that there was no live database in this environment to build and verify
a real implementation against. That's still true in the narrow sense —
this environment has no Docker (`docker: command not found`) and no
installed `psql`/`postgres` binary — but it understated the actual
option space: `@electric-sql/pglite` compiles real PostgreSQL to WASM and
runs it embedded, in-process. It is not a mock, a fake, or an
API-compatible reimplementation — it's genuinely Postgres (its own data
directory is a real, `initdb`-shaped Postgres cluster on disk, confirmed
by inspecting one after a real run). This closes the gap ADR-0022 left
open without needing infrastructure this environment doesn't have.

## Decision

1. **`drizzle-orm` + `@electric-sql/pglite`**, via `drizzle-orm/pglite`.
   Schema (`db/schema.ts`): `users`, `sessions`, with a real foreign key
   (`sessions.user_id → users.id ON DELETE CASCADE`) — a constraint the
   in-memory stores had no way to express or enforce.
2. **`createDb(dataDir?)`**: no `dataDir` → fully in-memory (what tests
   use, a fresh real Postgres instance per test); a real path → persists
   to disk (what the actual running server uses). One factory, two modes,
   not two different implementations.
3. **`PostgresUserStore`/`PostgresSessionStore` implement the exact same
   `UserStore`/`SessionStore` interfaces** ADR-0022 defined — `AuthService`
   didn't change at all. This is the payoff of having designed those as
   injectable interfaces in the first place.
4. **`ensureSchema()` is `CREATE TABLE IF NOT EXISTS`, not a migrations
   framework.** There's no released data yet to migrate away from;
   `drizzle-kit`'s real migration tooling is worth adopting once an
   actual schema change needs to run against data that already exists,
   not before.
5. **`index.ts` now constructs `Postgres*Store`s (with a persistent
   `DATABASE_PATH`, default `./data/ekusupo-db`) instead of the in-memory
   defaults `buildServer()` still falls back to.** Existing route-level
   tests (`auth-routes.test.ts`, `server.test.ts`) are unchanged and stay
   fast — they still get in-memory stores unless a test explicitly asks
   for real ones. New tests (`postgres-user-store.test.ts`,
   `postgres-session-store.test.ts`) exercise the real Postgres path
   directly, including a real unique-constraint violation, a real
   foreign-key violation, and a real cascading delete — none of which
   the in-memory stores could ever have caught, because they don't
   enforce any of that.

## Two real bugs found while verifying this, not while writing it

The point of insisting on a real running server (established as this
session's own bar — ADR-0021, ADR-0023) rather than stopping at `tsc`/
`.inject()`:

- **pglite doesn't create its data directory recursively.** Starting a
  real server against a fresh checkout (`./data` not yet existing)
  failed with `ENOENT` — pglite's own directory setup only creates the
  leaf directory, not its parents. Fixed by `mkdirSync(dataDir, {
recursive: true })` before constructing `PGlite`. `pnpm test` never
  would have caught this — the in-memory-mode tests never touch a real
  directory path at all.
- **The first boot against a fresh directory takes longer than a normal
  Fastify start** (pglite runs a real Postgres `initdb`-equivalent the
  first time). An earlier smoke-test attempt with too short a wait
  looked like a silent failure; a longer wait on retry showed the server
  had, in fact, started correctly. Not a bug in the code, but a real
  operational characteristic worth knowing before treating a slow first
  request as broken.

Both were caught by actually starting the process, signing up, killing
it, and restarting it against the same directory — not by any static
check.

## Consequences

- Restarting `services/api` no longer loses every account and session —
  the exact limitation ADR-0022 flagged as acceptable "for this stage"
  is now fixed. Verified directly: signed up against one server process,
  killed it, started a fresh process against the same `DATABASE_PATH`,
  signed in successfully against the second process.
- `services/api/data/` is gitignored — it's a real (if embedded)
  database's on-disk state, not something to commit.
- A hosted Postgres later is a real, common Drizzle pattern (swap
  `drizzle-orm/pglite` for `drizzle-orm/node-postgres`, point at a
  `DATABASE_URL`) — not implemented here, because there's no way to
  verify it actually works without a real hosted instance, and this
  session doesn't claim things it can't verify (the same reasoning
  ADR-0022 already used to defer this exact thing).

## Alternatives Considered

- **A hand-rolled dual-driver `createDb()`** (real `pg`/`node-postgres`
  when `DATABASE_URL` is set, `pglite` otherwise) — rejected for this
  pass. The real-Postgres branch would be entirely unverified code
  shipped alongside verified code, which is worse than not having it:
  it looks tested when it isn't. Add it when there's an actual hosted
  instance to test against.
- **SQLite** (e.g. `better-sqlite3`) instead of pglite. Rejected — it
  isn't Postgres; ADR-0017 already chose Postgres specifically, and
  pglite delivers that decision for real instead of substituting a
  different database because Postgres itself wasn't locally available.
