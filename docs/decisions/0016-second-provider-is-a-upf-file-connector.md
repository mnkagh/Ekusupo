# ADR-0016: Second Provider Is a UPF File Connector, Not a Second Streaming Service — And Can't Prove Live Transfer

Status: Accepted

## Context

ROADMAP.md's v0.3.0-alpha called for a second provider to "validate
cross-provider transfer" (ADR-0011's own framing). The obvious choice —
Apple Music, YouTube Music, Deezer, TIDAL — hits the exact same
external-credential wall Spotify's OAuth did (ADR-0012, ADR-0014): every
one of them needs a registered developer app before any real code
against it can run. Building a second streaming connector wouldn't avoid
that problem, it would just duplicate it.

CLAUDE.md §6.2 and §2.3 already list file/export connectors (CSV, JSON,
M3U, UPF, "backup targets") as a legitimate connector category, distinct
from streaming providers and requiring no external credentials at all. A
`packages/providers/upf-file` connector — read/write a local UPF JSON
file — seemed like a clean way to get a real second connector without
the credential blocker.

**Building it surfaced something that needed to be checked before
claiming it "validates cross-provider Live Transfer": it can't be a
`runLiveTransfer` destination, and that's not a bug to fix.**

`packages/core/src/run-transfer.ts`'s `runLiveTransfer`, per track:

```ts
const attempt = await matchAgainstDestination(searchTracks, destinationSession, sourceTrack);
const decision = recordMatchAttempt(report, sourceTrack, attempt);
if (!decision) continue;
await addTracksToPlaylist(destinationSession, destinationPlaylistId, [decision.candidate]);
```

`decision.candidate` comes from the **destination's own search results**
(`packages/matching`'s `matchTrack` picks the best of whatever
`searchTracks` returned) — not the source track itself. That's exactly
right for streaming-service-to-streaming-service transfer: find the
equivalent recording already in the destination's catalog, then add
_that_ destination-native track. A UPF file has no catalog to search —
there's nothing for `searchTracks` to return candidates from, honestly.
Declaring `tracks.search` on a file connector to satisfy
`runLiveTransfer`'s upfront capability check would mean either
fabricating fake candidates or returning the source track relabeled as a
"match" — both are exactly the kind of dishonest capability reporting
CLAUDE.md §3.4 and §16.2 forbid, not a workaround to reach for.

## Decision

1. **`@ekusupo/provider-upf-file` declares `playlists.read`,
   `playlists.create`, `playlists.addTracks` — never `tracks.search`.**
   This is accurate, not a limitation to route around. See its README.md.
2. **This is a scope boundary the architecture already implies, not a
   Transfer Engine defect.** CLAUDE.md's own roadmap lists "Backup
   Engine" as a distinct, not-yet-built component from the Transfer
   Engine (§4.1's diagram, "Current Project Status" in the autonomous
   prompt). A write-through export target was never supposed to go
   through `runLiveTransfer`'s match-based write path — it wants a
   different operation ("persist this playlist as-is"), which doesn't
   exist yet and isn't being built here either. No Transfer Engine change
   is proposed by this ADR.
3. **What this connector _does_ prove, honestly:**
   - Cross-provider **Dry Run** (`runDryRunTransfer`) against two real,
     independently-implemented connectors — `@ekusupo/provider-spotify`
     (fake-fetch-backed, same style as its own tests) and
     `@ekusupo/provider-upf-file` (a real temp file) — not
     `packages/core`'s own in-test fakes. See
     `tests/integration/src/cross-provider-dry-run.test.ts`.
   - A direct read (`getPlaylist`) → write (`createPlaylist`,
     `addTracksToPlaylist`) round trip across the two connectors,
     outside the Transfer Engine entirely — the shape a future
     Export/Backup feature would build on (same test file).
4. **A new top-level `tests/integration` package** (CLAUDE.md §14.1
   already reserves `tests/` for this). `packages/core` may never import
   a provider package directly, including from its own tests (ADR-0002,
   enforced by `eslint.config.js`'s `coreNeverImportsProvidersDirectly`
   with no test-file exemption) — a test exercising two real providers
   together has to live outside `packages/core` for that reason alone.

## What this means for ROADMAP.md

"Live Transfer demonstrated source → destination across two real
providers" is **not** satisfied by this connector and shouldn't be
marked done. It still needs either:

- A second real **catalog** provider (another streaming or self-hosted
  service with genuine search) — blocked on the same external-credential
  problem every commercial option has; or
- A deliberate Transfer Engine enhancement adding a write-through
  destination mode that bypasses matching — which would be exactly the
  kind of "implementation reveals a weakness, STOP and propose" situation
  the standing project rule covers, and isn't proposed here because
  nothing about today's usage actually needs it yet (no real second
  catalog provider exists to transfer _into_ either).

ROADMAP.md is updated to reflect what's actually true: a second connector
exists and cross-provider Dry Run is proven; cross-provider Live Transfer
remains not started, for a documented reason rather than silently implied
by "second provider done."

## Alternatives Considered

- **Make `searchTracks` return the query re-wrapped as a fake candidate**
  so `runLiveTransfer` "works." Rejected — `SearchQuery` only carries
  `{ text, isrc }`, not the full source `Track` (artists, album,
  duration, external ids), so the "candidate" written to the destination
  would have strictly worse metadata than the original. Worse, it
  reports a successful match that isn't real. Both problems are
  self-inflicted by forcing a fit that isn't there.
- **Extend `runLiveTransfer` now** with a write-through mode for
  search-less destinations. Rejected for _this_ ADR — doing so without a
  real second catalog provider to prove the matching path still works
  correctly would be designing against a hypothetical, not a concrete
  need (the same reasoning ADR-0011 used to reject building a second
  provider prematurely, applied one layer deeper).
- **Skip building a second provider until a streaming one's credentials
  are available.** Rejected — a file connector is genuinely useful today
  (Dry Run validation, a preview of the Export UPF feature) and required
  zero external dependencies to build; waiting idly for credentials that
  may not arrive soon would leave real, available progress undone.
