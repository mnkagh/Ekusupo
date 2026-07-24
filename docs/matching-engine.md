# Matching Engine v0.1

This document is architecture and contracts only. For implementation-level
type definitions, read `packages/matching/src` directly — it's the
authoritative implementation of what's described here.

## What is the Matching Engine?

The Matching Engine decides whether a track from one provider is "the same
song" as a candidate track from another provider (CLAUDE.md §10.1). It is
`packages/matching`: pure functions over UPF `Track` values. It has no
knowledge of providers, sessions, HTTP, or transfer orchestration.

## Why is it a separate package from the Transfer Engine?

`docs/connector-sdk.md` already draws this line: matching decisions are
explicitly not the SDK's job, and `docs/transfer-engine.md` draws it again
from the other side — orchestration is not matching's job. Keeping matching
in its own package means:

- It's testable with plain fixtures — no provider, session, or network
  involved at all.
- It's reusable outside a transfer (e.g. a future "find duplicates in this
  playlist" feature could call the same function).
- The Transfer Engine can depend on it without matching ever depending back
  on `packages/core` (enforced by an ESLint boundary rule, see below).

## What does v0.1 implement?

CLAUDE.md §10.2 lists ten matching layers. v0.1 implements the first six —
the **deterministic** layers, ones that don't require judgment calls under
ambiguity:

1. Exact provider identifiers (a candidate literally references the same
   provider-native ID as the query — only meaningful within a single
   provider, included for completeness).
2. ISRC or UPC (`Track.externalIds.isrc`, `Album.externalIds.upc`).
3. Normalized title and primary artist.
4. Album and release metadata (title, primary artist).
5. Duration tolerance (candidates within a small window of the query's
   `durationMs`).
6. Explicit or clean version compatibility (a signal used to adjust
   confidence/risk, not a hard filter — see below).

## What's deferred to Phase 7?

Layers 7-10 — featured-artist handling, regional availability, popularity/
canonical-release hints, and AI-assisted reasoning for ambiguous cases —
require the AI matching work the project's roadmap tracks separately as
**Phase 7 (AI Matching)**. `packages/matching` v0.1 does not define a
plugin/strategy interface for these to slot into later; CLAUDE.md §16.2
warns against building abstractions before there's a real second
implementation to justify them. When Phase 7 arrives, it extends or wraps
`matchTrack`, informed by how v0.1 actually gets used.

## What does a match decision look like?

Per CLAUDE.md §10.3, every match decision carries a confidence score, the
method that produced it, a human-readable reason, and a risk level:

```ts
type MatchMethod =
  "provider_id" | "isrc_upc" | "normalized_title_artist" | "album_metadata" | "duration_tolerance";

type MatchRisk = "low" | "medium" | "high";

interface MatchDecision {
  candidate: Track;
  confidence: number; // 0-100
  method: MatchMethod;
  reason: string;
  risk: MatchRisk;
  alternatives?: Track[]; // other plausible candidates, if any
}

interface MatchOutcome {
  query: Track;
  decision?: MatchDecision; // undefined = no match found
}
```

`matchTrack(query, candidates)` runs the six layers in order against the
candidate pool and stops at the first sufficiently confident match. A track
matched only on title/artist/duration (no strong identifier) is still a
match, but carries lower confidence and higher risk than an ISRC match —
callers (the Transfer Engine) use `risk`/`confidence` to decide whether an
item needs human review (CLAUDE.md §10.4), not to decide whether it counts
as "matched" at all.

## How does explicit/clean compatibility factor in?

It never blocks a match by itself — a clean and an explicit version of the
same recording are still the same song. It shifts `risk` upward when the
query and the chosen candidate disagree, so the Transfer Engine can surface
it as a low-confidence match worth reviewing rather than silently picking a
version the user might not have wanted (CLAUDE.md §10.4).

## How does the Transfer Engine call this?

For each source track, the Transfer Engine gathers destination candidates
(via the destination provider's search capability) and calls
`matchTrack(sourceTrack, candidates)`. It never reimplements matching logic
itself — see `docs/transfer-engine.md`.

## What explicitly does NOT belong here?

- **No provider calls.** `packages/matching` never calls
  `searchTracks`/`getPlaylist`/etc. — gathering candidates is the Transfer
  Engine's job; matching only compares `Track` values it's handed.
- **No orchestration.** Deciding what to do with a match (create, skip, ask
  the user) is the Transfer Engine's job.
- **No AI calls in v0.1.** Phase 7's concern, not this one.
- **No persistence.** Match decisions aren't stored by this package.

## Deferred / Open Questions

- Exact confidence-score weighting per layer is intentionally
  under-specified here; `packages/matching/src/match.ts` is the source of
  truth for the current values, and they're expected to be tuned as real
  transfers are run.
- Whether `alternatives` should be capped at some N is left to the
  implementation; not a contract decision yet.
- Cross-provider "same song, different edition" cases (remix, live,
  karaoke) beyond duration tolerance are not specially detected in v0.1 —
  CLAUDE.md §17.3 lists these as required matching test fixtures for the
  engine generally, and v0.1's tests cover what deterministic signals can
  reasonably catch; the harder cases wait for Phase 7.
