# ADR-0027: Transfer Engine on services/api

Status: Accepted

## Context

ADR-0025 gave `services/api` real, encrypted provider connections and
ADR-0026 wired them into `apps/web`. The Transfer Engine
(`@ekusupo/core`) had still only ever run inside `apps/extension`
(ADR-0011) and integration tests — nothing on the server could start a
transfer or persist one. This is the first server-side transfer.

## Decision

1. **Dry Run only.** `POST /transfers/dry-run` runs
   `runDryRunTransfer`; Live Transfer stays unwired. Dry Run never
   mutates a destination (ADR-0011), so exposing it over HTTP before a
   confirmation UI exists cannot damage a user's real library.
2. **Source and destination are both the caller's connected Spotify.**
   There is no destination-selection UI yet, the same scope reduction
   `apps/extension`'s `transfer-orchestrator.ts` already made — not a
   new decision. Spotify's real capability set is read-only
   (`profile.read`, `playlists.read`, no `tracks.search`), so such a run
   legitimately plans but never matches: status `partial`, every track
   skipped, with the limitation stated in the report.
3. **`PostgresTransferJobStore` implements `@ekusupo/core`'s
   `TransferJobStore` unchanged.** That interface's methods take no
   `userId`, so the store closes over one at construction and is built
   fresh per request. Every query is additionally scoped by `userId`, so
   one user's job id can never read or overwrite another's row — a
   same-id update from the wrong user is a silent no-op, not a
   cross-user write. Adapting at the edge kept the core interface
   provider- and transport-agnostic (CLAUDE.md §3.1).
4. **`transfer_jobs.report` is `jsonb`, nullable.** The row is created
   before the run starts so its status is queryable while in flight;
   `runDryRunTransfer` only returns a `TransferReport` once it resolves.
5. **One `db` backs every default store in `buildServer`.**
   `transfer_jobs.user_id` and `provider_connections.user_id` are real
   foreign keys to `users.id`. The in-memory stores ADR-0022 introduced
   predate this database existing, and leaving them as the default meant
   a user held in a `Map` while jobs were written to Postgres — an FK
   violation surfacing as an opaque 502 for any caller who used the
   defaults and ran a transfer. The in-memory implementations remain
   available by injection; they are simply no longer the default.
6. **`TransferReport.failureReason`** — set only when a job's status is
   `failed`. A run that stops before reading the source has all-zero
   counters, indistinguishable from a successful transfer of an empty
   playlist. Clients need to tell "finished, with caveats" from "did not
   finish" without parsing a human-readable list (CLAUDE.md §16.3). The
   reason is still appended to `providerLimitationsEncountered`, so
   existing report renderers keep working unchanged.

## Consequences

- A failed run is reported as a `failed` job with a reason and HTTP 200,
  not a 502 — the run itself executed, its outcome was failure, and the
  report explaining why is worth more to the caller than an opaque
  status code. The route's 502 path still guards genuinely unexpected
  errors.
- This surfaced a real bug in `apps/extension`: its orchestrator
  destructured only `{ report }` and called `onCompleted`, so a failed
  run displayed to the user as a completed transfer with zero counters.
  It now checks `job.status` explicitly. `packages/core` also no longer
  throws out of `runDryRunTransfer` when the source read fails, which
  had contradicted its own documented "never throws for a partial
  failure" contract.
- Vitest's `testTimeout` is raised to 30s. `services/api` tests run
  against real embedded Postgres (ADR-0024) and the first `pglite`
  instance per worker pays a one-time WASM compile that alone can exceed
  the 5s default. Raising the timeout keeps the tests real rather than
  substituting a fake database to fit a unit-test budget.

## Alternatives Considered

- **Adding `userId` to core's `TransferJobStore`.** Rejected: it would
  push a server-side authorization concern into a package that also runs
  inside a browser extension with no concept of users.
- **Dropping the foreign keys** so in-memory and Postgres stores could
  coexist. Rejected: the FKs are what make user deletion cascade
  correctly (CLAUDE.md §21.2), and a proven cascade is worth more than
  the convenience of mixed storage.
- **Reading the failure reason from the last element of
  `providerLimitationsEncountered`.** Rejected: correct today only
  because `failJob` happens to push last, an implicit ordering coupling
  that would break silently.

## What's still deferred

Live Transfer over HTTP, destination selection, background job
execution (transfers run inline in the request — fine for Dry Run,
inadequate for large real transfers, CLAUDE.md §13.2), cancellation,
and the transfer setup/progress/history screens in `apps/web`.
