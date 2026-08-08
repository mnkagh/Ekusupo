# ADR-0018: Live Transfer Write-Through Mode for Search-less Destinations

Status: Accepted

## Context

ADR-0016 found that `@ekusupo/provider-upf-file` — built as a
credential-free second provider to validate cross-provider transfer —
could not be a `runLiveTransfer` destination: the write step always adds
whatever the destination's own `tracks.search` returned
(`decision.candidate`), not the source track, and a file has no catalog
to search. ADR-0016 considered extending `runLiveTransfer` with a
write-through mode and rejected it _for that ADR_, reasoning that doing
so "without a real second catalog provider to prove the matching path
still works correctly would be designing against a hypothetical."

The user reviewed that reasoning and directed it to be fixed. Re-examining
the premise: the write-through branch and the existing match-based branch
don't interact — a destination either has `tracks.search` (existing
path, byte-for-byte unchanged) or it doesn't (new path). There was never
a risk to "the matching path still working correctly" because write-through
doesn't touch it. The original rejection was more cautious than the actual
design required. This ADR supersedes that specific rejection in ADR-0016
(the rest of ADR-0016's reasoning — why `@ekusupo/provider-upf-file`
honestly declares no `tracks.search` — still stands).

## Decision

1. **`runLiveTransfer`'s destination capability check no longer requires
   `tracks.search`.** `playlists.create` and `playlists.addTracks` remain
   mandatory (a destination that can't write at all was never viable for
   any Live Transfer). `tracks.search`'s presence now _selects a write
   strategy_ per track rather than gating the whole operation.
2. **`planTrackWrite` branches once per track**: destination can search →
   existing `matchAgainstDestination` + `recordMatchAttempt` flow,
   writing `decision.candidate` (unchanged code path, unchanged tests).
   Destination can't search → write the source track directly, no
   matching attempted.
3. **Report semantics stay honest.** Write-through tracks increment
   `createdItems` (a real write happened) but never `matchedItems` (no
   comparison against a catalog occurred) — reusing "matched" for a
   copy-through would misrepresent what happened. A single
   `providerLimitationsEncountered` note explains the mode once, mirroring
   ADR-0011's Dry Run precedent, not per-track spam.
4. **No new execution mode, no new exported function.** This is a
   per-track write-strategy decision inside `runLiveTransfer`, not a
   third top-level mode alongside Dry Run/Live Transfer (ADR-0011) — both
   branches share the exact same requirement floor (destination must be
   able to write), unlike Dry Run vs. Live Transfer's genuinely different
   floor (write required or not).

## Consequences

- `@ekusupo/provider-upf-file` can now be a real `runLiveTransfer`
  destination. `tests/integration/src/cross-provider-live-transfer.test.ts`
  proves it: Spotify (fake-fetch-backed, read) → a real temp UPF file
  (write-through) — actual cross-provider Live Transfer, not just Dry
  Run, across two independently-implemented connectors.
- All pre-existing `run-transfer.test.ts` tests pass unmodified — the
  match-based path's behavior, including its exact report shape and
  retry semantics, is provably unchanged.
- `ROADMAP.md`'s "Live Transfer demonstrated source → destination across
  two real providers" is now genuinely satisfied for the write-through
  case. The match-based case (streaming-to-streaming) still needs a
  second real catalog provider, which remains blocked on external
  credentials — that part of ADR-0016's conclusion is unchanged.

## Alternatives Considered

- **Leave ADR-0016's rejection standing, wait for a second catalog
  provider.** Rejected per explicit user direction, and on reflection the
  original caution wasn't actually load-bearing — see Context.
- **A new `runExportTransfer` function instead of branching inside
  `runLiveTransfer`.** Rejected — would fragment the public API for a
  distinction (search vs. no search) that's already exactly what
  `getCapabilities()` communicates; callers don't need to pick a
  different function, the engine already has the information to decide.
- **Increment `matchedItems` for write-through tracks too**, since they
  did end up on the destination. Rejected — `matchedItems` would then mean
  two different things depending on destination capability, undermining
  CLAUDE.md §9.4's transparent-reporting goal for anyone reading a report
  without also knowing which mode produced it.
