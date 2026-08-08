# ADR-0011: Transfer Engine Execution Modes (Dry Run / Live Transfer)

Status: Accepted

## Context

While planning Phase 5 PR5 (browser extension transfer integration), two
problems surfaced together:

1. `feature/browser-extension` branched from `develop` before
   `feature/transfer-engine` (ADR-0006) existed, so it doesn't contain the
   real Transfer/Matching Engine at all yet — only the empty Phase 2
   scaffolds. That's a merge-ordering problem, not an architecture problem,
   and is resolved by merging this branch (which continues
   `feature/transfer-engine`) into `develop`, then merging `develop` into
   `feature/browser-extension` before PR5 resumes.
2. The real architecture problem: `runTransfer` (`packages/core/src/run-transfer.ts`)
   unconditionally requires `destination.searchTracks` and
   `"tracks.search"` on the destination's declared capabilities — even when
   `options.dryRun` is `true`. Only that one upfront check is unconditional;
   the later `playlists.create`/`playlists.addTracks` check already has a
   `!dryRun &&` guard. Today, Spotify (`packages/providers/spotify`) is the
   only provider that exists, and its `supportedCapabilities` is
   deliberately read-only (`profile.read`, `playlists.read` — see
   ADR-0005 and the provider's own README). There is no possible
   destination today, so `runTransfer` cannot succeed even in dry-run mode,
   regardless of source/destination choice.

CLAUDE.md §9.3 lists "Dry-run mode" and "Preview mode" as explicit Transfer
Engine requirements, and §20.2 requires clients to "show what will happen
before it happens." A dry run whose only purpose is to preview a plan
should not need the same capabilities a live, mutating transfer needs.
Requiring `tracks.search` for a dry run conflates "can I show the user a
plan" with "can I write to the destination" — two different questions that
happened to share one code path in v0.1.

## Decision

Split `runTransfer`'s implementation into two explicit, independently
testable execution modes, while keeping `runTransfer` itself as the stable,
backward-compatible public entry point:

```text
Transfer Engine
       |
   Execution Mode
       |
   +---+---+
   |       |
Dry Run  Live Transfer
```

1. **`ExecutionMode = "dryRun" | "live"`** (new,
   `packages/core/src/execution-mode.ts`), derived from
   `TransferOptions.dryRun` — the existing public option keeps its exact
   meaning and shape; nothing about `runTransfer`'s signature,
   `TransferOptions`, `TransferJob`, or `TransferReport` changes.

2. **`runDryRunTransfer(params)`** (new, exported):
   - Requires only `source` capabilities (`playlists.read`) — the same
     requirement live transfer has for the source side.
   - Never requires `destination` write capabilities
     (`playlists.create`/`playlists.addTracks`) — unchanged from v0.1.
   - **Never requires `destination` search capability (`tracks.search`)
     either — this is the actual fix.** If the destination can search,
     dry run uses it to run real deterministic matching and produce a
     genuine plan. If it can't (Spotify today), dry run still completes:
     it reads the source, normalizes it, and reports every item as
     unavailable-pending-match with one clear
     `providerLimitationsEncountered` entry explaining why, rather than
     failing the whole job.
   - Never calls `createPlaylist` or `addTracksToPlaylist` — dry run
     cannot mutate any provider, by construction (the code path that
     would call them doesn't exist in this function).

3. **`runLiveTransfer(params)`** (new, exported): the v0.1 write path,
   unchanged in behavior — requires source read, destination search, and
   destination write capabilities upfront; searches, matches, creates the
   destination playlist, and writes tracks exactly as `runTransfer` always
   has for `dryRun: false` (or unset).

4. **`runTransfer(params)`** becomes a two-line dispatcher:
   `params.options?.dryRun ? runDryRunTransfer(params) : runLiveTransfer(params)`.
   Existing callers (and all of `run-transfer.test.ts`'s current cases)
   keep working unmodified — this is additive, not a breaking change.

5. **Shared internals, not shared top-level control flow.** Job
   creation/finalization, the source-playlist read, and the
   search-then-match-then-record step are extracted into small private
   helpers used by both modes (`readSourcePlaylist`, `matchAgainstDestination`,
   `recordMatchAttempt`, `finishJob`). The two modes' outer orchestration
   stays as two separate functions rather than one function branching
   internally on a flag at every step — the whole point of this ADR is
   that "what capabilities are required" and "does this mutate a
   provider" should be readable as two distinct, complete code paths, not
   inferred from scattered `if (!dryRun)` checks.

## Consequences

- PR5 can now demonstrate a real, working flow with only one provider:
  `Spotify Playlist → Spotify Provider → UPF → Transfer Engine (Dry Run) →
Transfer Report`, with no destination provider involved at all. This is
  the initial browser-extension integration path.
- A second, write-capable provider is still required before **Live
  Transfer** can ever succeed against a real destination — that's expected
  and correct; it validates cross-provider transfer, not dry-run
  correctness (CLAUDE.md §22.1: prove the core before adding providers).
- `packages/core`'s public surface grows by two named exports
  (`runDryRunTransfer`, `runLiveTransfer`) and one type (`ExecutionMode`).
  `runTransfer` remains the documented default entry point for callers who
  just want to pass `options.dryRun`; the two mode-specific functions exist
  for callers (like a future extension/web-app integration) that want to
  call a specific mode directly without constructing an options object.
- `docs/transfer-engine.md`'s "Transfer flow" and "Dry-run mode" sections
  needed rewriting to describe two flows instead of one flow with a branch
  in it — done in this same change.

## Alternatives Considered

- **Just remove the `tracks.search` check when `dryRun` is true** (the
  smallest possible diff) — rejected as too implicit. It fixes the bug but
  leaves "what does dry run actually require/guarantee" answerable only by
  reading scattered conditionals inside one large function, which is
  exactly what made the original bug easy to introduce and easy to miss in
  review. The user who requested this change explicitly asked for the
  cleaner split over the minimal patch.
- **A single `runTransfer` that takes a `mode` parameter instead of a
  `dryRun` boolean** — rejected. It would be a breaking API change for no
  behavioral benefit; `dryRun` already has one unambiguous meaning and
  existing callers/tests already depend on it.
- **Build a second provider connector now to unblock Live Transfer** —
  rejected (this is the user's own call, not just this ADR's). It solves
  the wrong problem: the Transfer Engine's dry-run path should not require
  a second provider to exist at all. A second provider is still needed
  eventually to validate Live Transfer, but that's separate, later work.
