# ADR-0022: Web Dashboard Auth v1

Status: Accepted

## Context

ADR-0021 scaffolded `apps/web`/`services/api` but explicitly deferred
both the data model and auth, reasoning that designing a schema
disconnected from a real feature would be premature (CLAUDE.md §16.2).
Auth is that first real feature — a sign-in screen needs a `users` table
specifically, so it's the natural next step rather than a standalone
schema exercise.

ADR-0017 already decided _what_: own session-based auth, not a
third-party auth service. This ADR covers _how_, scoped to
`services/api` only — mirroring how `apps/extension`'s PR2 (messaging
layer) shipped with real logic and full test coverage before PR3 wired
anything into a visible UI. `apps/web`'s sign-in screen is the next step
after this one, not part of it.

## Decision

1. **Password hashing via `node:crypto`'s built-in `scrypt`, not a new
   dependency.** bcrypt/argon2 packages need native bindings, which risk
   failing to compile in some environments; Node's built-in `scrypt` is
   OWASP-acceptable, requires nothing to install, and continues this
   repo's repeated preference for solving a contained problem directly
   (ADR-0007, ADR-0008, ADR-0020) over adding a library. Per-user random
   salt, stored alongside the hash as `<saltHex>:<hashHex>`; comparison
   uses `timingSafeEqual` to avoid leaking timing information.
2. **`UserStore`/`SessionStore` are injectable interfaces with in-memory
   defaults** — the exact pattern `packages/core`'s `TransferJobStore`
   already established. Not backed by Postgres yet: there's no live
   database in this environment to actually verify a real connection
   against (unlike Fastify/Vite, which were smoke-tested directly — see
   ADR-0021 — a claimed-working Postgres connection couldn't be). Standing
   up a real `services/api` deployment with a database is its own future
   step; this interface shouldn't need to change when that happens.
3. **Sessions are opaque server-side tokens in an httpOnly cookie**
   (`ekusupo_session`), not JWTs — consistent with "own session-based
   auth" meaning the server can revoke a session immediately (delete from
   `SessionStore`), which a self-contained JWT can't do without an
   additional revocation list. 7-day expiry, checked (and the session
   deleted) lazily on each `getUserForSession` call rather than via a
   background sweep — there's no scheduler in this codebase yet and one
   isn't needed for correctness, only for reclaiming memory in the
   in-memory store, which is itself temporary.
4. **`SameSite: "lax"` as this stage's CSRF mitigation** (CLAUDE.md
   §12.6). Sufficient for same-site requests from `apps/web`; explicit
   CSRF tokens are real future work once a cross-site request pattern
   actually needs one, not assumed preemptively.
5. **`@fastify/cookie` and `@fastify/cors`** — official Fastify-org
   plugins, the same trust tier as choosing Fastify itself (ADR-0017),
   not a random third-party dependency.
6. **Same error message for "no such email" and "wrong password."**
   Distinguishing them would let a caller enumerate registered emails —
   the routes and the service both preserve this; `AuthError` carries a
   single user-safe message, never provider/implementation detail.
7. **Four routes**: `POST /auth/sign-up`, `POST /auth/sign-in`,
   `POST /auth/sign-out`, `GET /auth/me`. Fastify's own JSON-schema body
   validation (already a peer dependency, no new package) rejects a
   malformed request before it reaches `AuthService` at all.

## Consequences

- A real account can be created, signed into, checked, and signed out of
  — verified with an actual running server (`tsx` + `curl` through the
  whole flow), not only `.inject()` in a test process.
- `apps/web` has nothing to call yet — its sign-in screen is the next
  step. `services/api`'s auth is usable today from any HTTP client
  (`curl`, a future `apps/web`, even `apps/extension` eventually) the
  moment CORS is pointed at the right origin.
- Restarting the server loses every account and session — acceptable for
  this stage (mirrors `InMemoryTransferJobStore`'s own documented
  limitation) and will stop being true the moment a Postgres-backed
  `UserStore`/`SessionStore` exists.

## What's deferred (deliberately, not silently)

- **Postgres-backed `UserStore`/`SessionStore`.** Same interfaces,
  different implementation — no design decided here since there's no
  live database to build and verify it against yet.
- **`apps/web`'s sign-in/sign-up UI.** Next step, not this one.
- **Password reset, email verification, rate limiting on sign-in
  attempts.** Real, valuable future work; none of them block a first
  working sign-up/sign-in loop, and CLAUDE.md §16.2 argues against
  building them ahead of an actual need.
- **CSRF tokens beyond `SameSite=Lax`.** Revisit if a cross-site request
  pattern (e.g. a future public API consumed by third parties) actually
  needs one.

## Alternatives Considered

- **bcrypt or argon2** for password hashing. Rejected for this stage —
  both need native bindings; `node:crypto`'s `scrypt` needs nothing to
  install and is already an accepted KDF, matching this repo's stated
  preference for the smaller dependency-free solution when one exists.
- **JWTs instead of server-side sessions.** Rejected — ADR-0017 already
  chose "own session-based auth" specifically over a token-based approach,
  and immediate server-side revocation (sign-out actually invalidates a
  session right away) is a real property JWTs don't have without extra
  infrastructure.
- **Standing up a real Postgres connection now** (e.g. via a
  Docker-Compose-documented local instance). Rejected for this pass —
  nothing in this environment can actually run or verify one, and
  claiming a database integration works without ever connecting to a
  real database would be exactly the kind of unverified claim this
  session has otherwise avoided (see ADR-0021's insistence on a live
  `curl` smoke test, not just `tsc`).
