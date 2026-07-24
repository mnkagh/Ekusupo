# Transfer Engine v0.1

This document is architecture and contracts only. For implementation-level
type definitions, read `packages/core/src` directly — it's the
authoritative implementation of what's described here.

## What is the Transfer Engine?

The Transfer Engine orchestrates moving one playlist from a source
provider to a destination provider (CLAUDE.md §9.1). It is
`packages/core`: the only package that knows how to sequence "read from a
`MusicProvider`, match with `packages/matching`, write to another
`MusicProvider`." It must be provider-agnostic — it never imports a
provider package directly (ADR-0002), only `@ekusupo/connector-sdk`.

## What problem does it solve?

Without it, "transfer a playlist" would be reimplemented per client (web
app, extension), duplicating exactly the logic CLAUDE.md §3.3 forbids
duplicating. With it, every client calls the same `runTransfer` function
and gets the same guarantees: capability checks before any write, partial
success instead of all-or-nothing failure, and a report explaining what
happened.

## Transfer flow

Per CLAUDE.md §9.2, mapped onto what `runTransfer` actually does:

```text
Validate request
        |
Check source capabilities (playlists.read)
        |
Check destination capabilities (playlists.create / playlists.addTracks)
        |
Read source playlist (source.getPlaylist)
        |
For each track:
  gather destination candidates (destination.searchTracks)
  matchTrack(query, candidates)          <- packages/matching
  if dryRun: record outcome, no write
  else: write (destination.createPlaylist / addTracksToPlaylist)
  ConnectorError with retryable=true -> retry once, respecting retryAfterMs
  otherwise -> record as failed, continue with the next track
        |
Assemble TransferReport
        |
Persist job status (TransferJobStore)
```

A failure on one track never aborts the whole job — CLAUDE.md §9.3 requires
partial success, not all-or-nothing.

## Job model

```ts
type TransferJobStatus =
  "pending" | "running" | "paused" | "cancelled" | "completed" | "failed" | "partial";

interface TransferJob {
  id: string;
  status: TransferJobStatus;
  sourceProvider: string; // manifest.name
  destinationProvider: string;
  sourcePlaylistId: string;
  createdAt: string; // ISO 8601
  updatedAt: string;
  dryRun: boolean;
}
```

`status` starts `"pending"`, moves to `"running"` once `runTransfer`
begins, and ends in one of `"completed"` (no failed items), `"partial"`
(some items failed or were skipped), `"failed"` (the job couldn't start at
all — e.g. a capability check failed), or `"cancelled"`.

## Where does job state live?

Nowhere durable yet. `runTransfer` takes an injectable `TransferJobStore`:

```ts
interface TransferJobStore {
  create(job: TransferJob): Promise<void>;
  get(id: string): Promise<TransferJob | undefined>;
  update(id: string, patch: Partial<TransferJob>): Promise<void>;
}
```

`InMemoryTransferJobStore` is the default. No `services/api` or
`services/worker` exist yet (CLAUDE.md §4.7's infrastructure layer isn't
built), so there's nothing to back a real store with. This is the same
injection pattern already used for `fetchImpl` in
`packages/providers/spotify` — the contract is defined now, a real
(database-backed) implementation is future work once services exist.

Cancellation works against this store today: setting a job's status to
`"cancelled"` mid-run causes `runTransfer` to stop processing further
tracks the next time it checks. "Resume after interruption" (CLAUDE.md
§9.3) is not implemented in v0.1 — it needs a real store to resume _from_,
which doesn't exist yet; the job model is shaped so a future durable store
could support it without a redesign.

## Transfer report

Per CLAUDE.md §9.4:

```ts
interface TransferReport {
  sourceProvider: string;
  destinationProvider: string;
  itemType: "playlist"; // only value in v0.1
  totalItems: number;
  matchedItems: number;
  createdItems: number;
  skippedItems: number;
  failedItems: number;
  lowConfidenceMatches: MatchDecision[]; // from packages/matching
  unavailableItems: Track[];
  providerLimitationsEncountered: string[];
  userActionsRequired: string[];
}
```

Every `runTransfer` call returns `{ job, report }`, whether or not every
item succeeded — a partial failure still produces a complete, readable
report, never a thrown exception for anything short of "couldn't start the
job at all."

## Retry and rate-limit handling

`packages/connector-sdk`'s `ConnectorError` already carries `retryable` and
`retryAfterMs` (see `docs/connector-sdk.md`). The Transfer Engine's only
retry policy in v0.1: on a `retryable: true` error, wait `retryAfterMs` (or
a small default) and retry the single failed operation once; if it fails
again, record the item as failed and move on. No exponential backoff, no
per-provider tuning — that's tracked as a later refinement once real
transfer volume exists to tune against.

## Dry-run mode

`TransferOptions.dryRun` runs the full read-and-match pipeline and produces
a real `TransferReport`, but skips every write call. This lets a client
show "here's what would happen" (CLAUDE.md §20.2: "show what will happen
before it happens") before the user commits to a transfer.

## Progress reporting

`TransferOptions.onProgress?(event: TransferProgressEvent)` is called as
each track is processed. No event bus, no queue — a direct callback,
matching the "pure domain logic" scope below. A future `services/worker`
can bridge this callback to a real progress channel (SSE, websocket, job
polling) without `runTransfer` itself changing.

## Relationship to the Connector SDK

`runTransfer` takes already-authenticated `MusicProvider` instances and
`AuthSession`s as parameters — it does not authenticate anything itself
(that's a client/API concern). It only calls methods declared in
`getCapabilities().supports`; calling an unsupported operation is a bug in
the engine, not something it should need to defensively check per call
beyond the upfront validation step.

## Relationship to the Matching Engine

The Transfer Engine gathers destination candidates (via
`destination.searchTracks`) and calls `packages/matching`'s `matchTrack`.
It owns the _decision_ of what to do with a `MatchOutcome` (write it,
report it as low-confidence, report it as unavailable) — matching itself
stays opinion-free about transfers.

## Scope of v0.1

- **Playlists only** — no saved tracks, saved albums, or library
  collections. Consistent with UPF v0.1's own scope.
- **Pure domain logic, no infrastructure** — no real database, queue, or
  HTTP layer. `runTransfer` is a plain async function; wiring it behind an
  API route is a later phase.
- **One source, one destination, one playlist per call** — no batch/bulk
  transfer orchestration in v0.1.
- **Deterministic matching only** — see `docs/matching-engine.md`.

## Explicitly out of scope

- Sync Engine (scheduled/recurring transfers) — not detailed anywhere
  beyond a name in CLAUDE.md §4.1's diagram, and not on the roadmap yet.
- AI-assisted matching — Phase 7.
- Real job persistence/queueing, retries across process restarts.
- The API layer that will eventually call `runTransfer` (`services/api`).
- A second real provider connector to transfer _between_ — v0.1's tests
  validate provider-agnostic orchestration using fake in-test providers
  (see `packages/core/src/run-transfer.test.ts`), not a live cross-provider
  transfer.

## Deferred / Open Questions

- Whether `TransferProgressEvent`'s shape needs richer step names once a
  real UI consumes it — left minimal for now.
- Batch transfers (multiple playlists in one job) — not modeled; likely a
  wrapper around repeated `runTransfer` calls rather than a redesign, but
  not decided.
- How `userActionsRequired` strings get surfaced/localized in a UI — a
  web app concern, not this engine's.
