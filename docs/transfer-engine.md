# Transfer Engine v0.1

This document is architecture and contracts only. For implementation-level
type definitions, read `packages/core/src` directly — it's the
authoritative implementation of what's described here.

As of ADR-0011, the engine has two explicit execution modes — **Dry Run**
and **Live Transfer** — described separately below rather than as one flow
with a `dryRun` branch. `runTransfer` is still the stable entry point;
`options.dryRun` picks which mode runs underneath it.

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

## Execution modes

`ExecutionMode` is `"dryRun" | "live"` (`packages/core/src/execution-mode.ts`).
`runTransfer(params)` picks a mode from `params.options?.dryRun` and
dispatches to one of two functions, both also exported directly for
callers that want to be explicit about which mode they're invoking:

```text
runTransfer(params)
        |
options.dryRun ?
   |                    |
   v                    v
runDryRunTransfer   runLiveTransfer
```

### Dry Run (`runDryRunTransfer`)

```text
Validate request
        |
Check source capabilities (playlists.read) — only requirement
        |
Read source playlist (source.getPlaylist)
        |
For each track:
  if destination can search (tracks.search): search + matchTrack, record outcome
  else: record as unavailable (one report note, not per-track spam)
  never write, never require destination write or search capabilities
        |
Assemble TransferReport
        |
Persist job status (TransferJobStore)
```

Dry run **never requires destination write or search capabilities** and
**never mutates any provider** — that's the whole point of ADR-0011: it
exists to validate the plan, normalize to UPF, and (when the destination
can search) run real deterministic matching, not to prove the destination
is writable. If the destination can't search at all (Spotify today, since
it's read-only — see ADR-0005 and the Spotify provider's own README), the
job still completes; it just can't produce real match candidates, and the
report says so once.

### Live Transfer (`runLiveTransfer`)

```text
Validate request
        |
Check destination capabilities (tracks.search, playlists.create, playlists.addTracks)
        |
Check source capabilities (playlists.read)
        |
Read source playlist (source.getPlaylist)
        |
Create destination playlist (destination.createPlaylist)
        |
For each track:
  gather destination candidates (destination.searchTracks)
  matchTrack(query, candidates)          <- packages/matching
  write (destination.addTracksToPlaylist)
  ConnectorError with retryable=true -> retry once, respecting retryAfterMs
  otherwise -> record as failed, continue with the next track
        |
Assemble TransferReport
        |
Persist job status (TransferJobStore)
```

Live Transfer requires full destination write capabilities upfront — this
is unchanged from v0.1's original (pre-ADR-0011) behavior; only Dry Run's
requirements changed. It's also the only mode that ever calls
`createPlaylist` or `addTracksToPlaylist`.

A failure on one track never aborts either mode's job — CLAUDE.md §9.3
requires partial success, not all-or-nothing.

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

`TransferOptions.dryRun: true` routes `runTransfer` to `runDryRunTransfer`
(see "Execution modes" above). It runs the read-and-match pipeline where
the destination supports it and produces a real `TransferReport`, but
never calls a write method and never requires destination write or search
capabilities — ADR-0011. This lets a client show "here's what would
happen" (CLAUDE.md §20.2: "show what will happen before it happens")
before the user commits to a transfer, and works even when only one
provider exists yet (see "Scope of v0.1" below).

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
- A second real **catalog** provider to Live Transfer _between_ —
  `@ekusupo/provider-upf-file` (ADR-0016) is a second real provider, and
  proves cross-provider Dry Run (`tests/integration`) beyond the fake
  in-test providers `packages/core/src/run-transfer.test.ts` uses, but a
  file has no searchable catalog, so it can't be a `runLiveTransfer`
  destination — that needs another provider with real `tracks.search`,
  which (like Spotify) needs its own external credentials. Dry Run works
  today against a single real provider used as both source and
  destination, or two different real providers, since it never requires
  destination write or search capabilities (ADR-0011).

## Deferred / Open Questions

- Whether `TransferProgressEvent`'s shape needs richer step names once a
  real UI consumes it — left minimal for now.
- Batch transfers (multiple playlists in one job) — not modeled; likely a
  wrapper around repeated `runTransfer` calls rather than a redesign, but
  not decided.
- How `userActionsRequired` strings get surfaced/localized in a UI — a
  web app concern, not this engine's.
