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
Check destination capabilities (playlists.create, playlists.addTracks — required;
                                 tracks.search — optional, picks the write strategy below)
        |
Check source capabilities (playlists.read)
        |
Read source playlist (source.getPlaylist)
        |
Create destination playlist (destination.createPlaylist)
        |
For each track:
  if destination can search (tracks.search):
    gather destination candidates (destination.searchTracks)
    matchTrack(query, candidates)          <- packages/matching
    write the matched destination-native candidate
  else:
    write the source track through as-is (no catalog to match against — ADR-0018)
  write via destination.addTracksToPlaylist
  ConnectorError with retryable=true -> retry once, respecting retryAfterMs
  otherwise -> record as failed, continue with the next track
        |
Assemble TransferReport
        |
Persist job status (TransferJobStore)
```

Live Transfer requires `playlists.create`/`playlists.addTracks` upfront,
unconditionally — this is unchanged from v0.1's original (pre-ADR-0011)
behavior. `tracks.search` is no longer required (ADR-0018): a
destination that can search gets the original match-based write (find
and write the equivalent destination-native track); a destination that
can't (a file export target has no catalog to search) gets the source
track written through directly instead of failing outright. Either way,
Live Transfer is still the only mode that ever calls `createPlaylist` or
`addTracksToPlaylist`.

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

`runTransfer` takes an injectable `TransferJobStore`:

```ts
interface TransferJobStore {
  create(job: TransferJob): Promise<void>;
  get(id: string): Promise<TransferJob | undefined>;
  update(id: string, patch: Partial<TransferJob>): Promise<void>;
}
```

`InMemoryTransferJobStore` is the default, and is what `apps/extension`
uses. Since ADR-0027, `services/api` backs the same interface with
Postgres (`PostgresTransferJobStore`), so the _record_ of a transfer
survives a restart — the **work** does not. A job still running when the
process dies is marked failed at the next boot (ADR-0033); resuming it
would need to know how far the writes got, which nothing records.

That store adapts rather than changes the interface: none of these
methods takes a `userId`, so it closes over one at construction and
scopes every query by it. One user's job id can never read or overwrite
another's row — a same-id update from the wrong user is a silent no-op.
Keeping the core interface free of user identity matters because the
same package runs inside a browser extension that has no concept of
users.

Cancellation works through this store, and that is the whole mechanism:
setting a job's status to `"cancelled"` makes `runTransfer` stop before
the next track. Nothing has to be signalled or aborted, which is exactly
why `POST /transfers/:id/cancel` (ADR-0033) can stop a job that the
request which started it stopped waiting for long ago. "Resume after
interruption" (CLAUDE.md §9.3) is still not implemented — the durable
store exists to resume _from_, but nothing reads it back that way yet.

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
  // Each pairs the source track with the decision made for it, so a
  // reviewer sees both ends — see docs/matching-engine.md.
  lowConfidenceMatches: LowConfidenceMatch[];
  unavailableItems: Track[];
  providerLimitationsEncountered: string[];
  userActionsRequired: string[];
  failureReason?: string; // set only when job.status is "failed"
}
```

Every `runTransfer` call returns `{ job, report }`, whether or not every
item succeeded — a partial failure still produces a complete, readable
report, never a thrown exception.

**Check `job.status` before treating a report as a success.** A run that
stops before reading the source has all-zero counters, which is
indistinguishable from a successful transfer of an empty playlist. When
the status is `"failed"`, `report.failureReason` states the single
reason the run stopped, as opposed to the per-item notes in
`providerLimitationsEncountered` (which also contains it, so existing
renderers keep working). Reading the reason from that list's last
element would work today only by accident of push ordering — use the
field.

## HTTP API (`services/api`)

All routes require an authenticated session cookie (401 otherwise) and
are scoped to the calling user — see ADR-0027 and ADR-0032.

| Route                        | Behavior                                                                                                                                |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /transfers/dry-run`    | Body `{ sourcePlaylistId, sourceProvider? }`. **202** with `{ job, pollUrl }`. 400 if the id is missing or the source is not reachable. |
| `POST /transfers/live`       | Body `{ sourcePlaylistId, destinationProvider, confirm: true, sourceProvider? }`. **202**. **Writes.**                                  |
| `POST /transfers/import-upf` | Body `{ document, destinationProvider, confirm: true, playlistId? }`. **202**. Same engine, with the uploaded document as the source.   |
| `POST /transfers/:id/cancel` | Stops a running transfer. 409 if it already finished; 404 if it is not the caller's.                                                    |
| `GET /transfers`             | The caller's jobs, newest first, each with its stored report, `progress`, and a `hasUpfDocument` flag.                                  |
| `GET /transfers/:id`         | One job. 404 if it does not exist **or belongs to another user** — the two are deliberately indistinguishable.                          |
| `GET /transfers/:id/upf`     | The UPF document that transfer produced, as a download. 404 when there is none, or it is another user's.                                |
| `DELETE /transfers/:id`      | Removes a finished job from history with its report and UPF export (CLAUDE.md §21.2). 409 while it is still running — cancel it first.  |

### Transfers run in the background

Starting a transfer answers **202 Accepted** with the job, not the
report: the engine makes one provider call per track, so a few hundred
tracks is minutes of work and no HTTP request should be held open for it
(CLAUDE.md §13.2, ADR-0033). Poll `GET /transfers/:id` until `status` is
one of `completed`, `partial`, `failed` or `cancelled`.

`progress` carries the engine's last event — `{ step, processed, total }`
— so a client can show a real position rather than a spinner.

Two guarantees worth relying on:

- **A terminal status means everything is stored.** The report and any
  UPF export are written _before_ the job is allowed to look finished, so
  a client that polls until terminal and then downloads never races.
- **A job left `running` by a crashed process is failed at boot**, with a
  reason saying so. Nothing polls forever.

Cancellation is cooperative: `POST /transfers/:id/cancel` writes the
status and the engine notices between tracks. **Tracks already written
stay written** — a transfer is not a transaction, and deleting things
from the destination that the user can already see would be worse than
stopping.

### Confirming a write

`confirm: true` is required by the route's own JSON schema, not by a
check inside the handler. A Live Transfer writes to a real destination
and CLAUDE.md §9.3 requires explicit confirmation for exactly that — in
the schema, no handler can forget it, and a client that copies the Dry
Run request shape gets a 400 rather than an unexpected write.

### Choosing a destination

`destinationProvider` is either a provider id from the registry or the
literal `"upf"`, meaning a downloadable UPF document. `"upf"` is not a
registry entry: there is no account to connect and no credentials to
configure, so `GET /providers/catalog` has nothing to say about it. It is
always available.

A provider destination is rejected up front, before the source is read,
when its connector does not declare `playlists.create` and
`playlists.addTracks` — the error names the provider and offers the file
destination instead. Today that rejects Spotify (read-only) and Apple
Music (catalogue-only); YouTube Music passes and then requires a
connected account.

### Who needs to connect an account

A connected Spotify account is used when there is one. When there isn't,
the server falls back to an app-level token and reads **public playlists
anonymously** — no login, no connection (ADR-0028). The response says
which was used via `usedConnectedAccount`.

The server still needs its own Spotify client ID and secret for either
path; Spotify has no unauthenticated API. What the anonymous path
removes is the _end user's_ involvement, not the credential. Writing to
a destination will always require a connected account.

A Dry Run uses the same provider as both source and destination, since
nothing is written and there is nothing to choose. Because Spotify is
read-only (no `tracks.search`), such a run legitimately plans but never
matches — expect `status: "partial"` with every track skipped and the
limitation stated in the report. That is correct behavior, not a bug.

A run that fails returns **200 with `job.status === "failed"`**, not a
5xx: the request succeeded, the transfer's outcome was failure, and the
report explaining why is more useful than an opaque status code. The
route's 502 is reserved for genuinely unexpected errors.

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
- Job queueing and retries across process restarts. Job _persistence_ is
  done (ADR-0027), but `services/api` runs a transfer inline in the HTTP
  request — acceptable for Dry Run, inadequate for large real transfers
  (CLAUDE.md §13.2).
- Live Transfer over HTTP. `services/api` exposes Dry Run only
  (ADR-0027); `runLiveTransfer` is reachable from library code and tests
  but not from the API.
- A second real **catalog** provider (another streaming or self-hosted
  service with genuine search) to prove Live Transfer's match-based write
  path cross-provider — still blocked on external credentials, same as
  Spotify's own OAuth. `@ekusupo/provider-upf-file` (ADR-0016) proves
  cross-provider Dry Run (`tests/integration`) and, since ADR-0018, real
  cross-provider **Live Transfer** via its write-through path — the
  match-based path specifically still only has fake-provider coverage.

## Deferred / Open Questions

- Whether `TransferProgressEvent`'s shape needs richer step names once a
  real UI consumes it — left minimal for now.
- Batch transfers (multiple playlists in one job) — not modeled; likely a
  wrapper around repeated `runTransfer` calls rather than a redesign, but
  not decided.
- How `userActionsRequired` strings get surfaced/localized in a UI — a
  web app concern, not this engine's.
