# ADR-0006: Transfer Engine and Matching Engine Architecture

Status: Accepted

## Context

Phase 3C (the Spotify reference provider) validated `packages/upf` and
`packages/connector-sdk` against a real API shape. `docs/connector-sdk.md`
already explicitly disclaims transfer orchestration and matching decisions
as out of its scope, deferring both to CLAUDE.md §9 (Transfer Engine) and
§10 (Matching Engine). This phase designs and implements both, as
`packages/core` (orchestration) and `packages/matching` (deterministic
candidate scoring) respectively — both already exist as empty Phase 2
scaffolds.

## Decision

1. **Transfer Engine lives in `packages/core`; Matching lives in
   `packages/matching`**, as two packages rather than one. CLAUDE.md's
   repo layout (§14.1) names no separate `packages/transfer`, and matching
   is independently testable/reusable without any provider or orchestration
   concept involved — worth keeping as its own package rather than folding
   it into `core`.
2. **Matching v0.1 implements CLAUDE.md §10.2's deterministic layers only**
   (provider ID, ISRC/UPC, normalized title+artist, album/release metadata,
   duration tolerance, explicit/clean compatibility as a risk signal).
   Layers 7-10 (featured-artist nuance, regional availability, popularity
   hints, AI-assisted reasoning) are Phase 7's job per the project roadmap.
   No plugin/strategy interface is built now for Phase 7 to slot into —
   that would be structure built for a phase that doesn't exist yet
   (CLAUDE.md §16.2).
3. **The Transfer Engine is pure domain logic — no infrastructure.**
   `runTransfer` is a plain async function taking already-authenticated
   `MusicProvider` instances and an injectable `TransferJobStore`
   (in-memory default). No `services/api` or `services/worker` exist yet,
   so there is nothing real to persist transfer jobs to; wiring a database-
   backed store is later work once those services exist.
4. **Playlist-only**, matching UPF v0.1's own scope decision. Saved
   tracks/albums/library collections are out of scope.
5. **Cross-provider orchestration is validated with fake in-test
   providers**, not a second real connector. Only Spotify exists today, and
   it's read-only — it cannot serve as a write destination. Tests define a
   minimal fake readable source and fake writable destination directly in
   `packages/core`'s own test suite (the same technique already used in
   `packages/connector-sdk`'s tests), proving `runTransfer` makes no
   assumption about which specific providers it's moving data between.
6. **Sync Engine is out of scope and not named in code.** CLAUDE.md §4.1's
   architecture diagram mentions it, but it has no further specification
   anywhere and isn't on the project roadmap yet.

## Extended dependency graph

ADR-0002 established `packages/core → packages/connector-sdk →
packages/providers/<name>`; ADR-0004 added `packages/upf` beneath
`connector-sdk` as the graph's leaf. This phase adds `packages/matching` as
a second consumer of `packages/upf`, alongside `connector-sdk` rather than
underneath it, with `packages/core` depending on both:

```text
                    packages/upf (leaf)
                    ^              ^
                    |              |
       packages/connector-sdk   packages/matching
              ^                       ^
              |                       |
   packages/providers/<name>          |
              ^                       |
              +---- packages/core ----+
```

`packages/matching` depends only on `packages/upf` — never on
`connector-sdk`, `core`, or any provider. `packages/core` is the only
package allowed to depend on `packages/matching`.

## Enforcement

Extended `eslint.config.js`:

- New `matchingStaysLeafLike`: `packages/matching/**` is blocked from
  importing `@ekusupo/core`, `@ekusupo/connector-sdk`, or
  `@ekusupo/provider-*`.
- `connectorSdkStaysProviderNeutral`, `providersNeverImportCoreDirectly`,
  and `upfStaysLeaf` each extended to also block `@ekusupo/matching` —
  keeps `packages/matching` reachable only from `packages/core`, the same
  way `packages/upf` is kept reachable only from above it.

This extends ADR-0002's and ADR-0004's enforcement mechanism; neither ADR
is modified.

## Alternatives Considered

- **Matching logic inside `packages/core` instead of a separate
  package** — rejected. Matching has no dependency on providers, sessions,
  or orchestration state; keeping it separate lets it be fixture-tested in
  complete isolation and reused outside a transfer context later (e.g. a
  future duplicate-detection feature).
- **Wiring a real (database-backed) `TransferJobStore` now** — rejected.
  No `services/api` or `services/worker` exist yet to own that
  infrastructure; building persistence with nothing to persist for yet
  would be exactly the "infrastructure before architecture" CLAUDE.md's
  lifecycle (§15.1) and release philosophy (§22.1) argue against.
- **A unified matching engine covering both deterministic and AI-assisted
  layers now** — rejected. Contradicts the project roadmap's own
  separation of Phase 4 (Transfer Engine) from Phase 7 (AI Matching); also
  premature given no AI matching design work has happened yet.
- **A pre-built strategy/plugin interface in `packages/matching` for
  Phase 7 to implement against** — rejected per CLAUDE.md §16.2 (no
  abstraction without a concrete second implementation to justify its
  shape). Phase 7 can wrap or extend `matchTrack` once it exists, informed
  by how v0.1 is actually used.

## Consequences

- `packages/core` becomes the first package that depends on both
  `connector-sdk` and `matching` — its only two package dependencies,
  keeping the boundary between "talks to providers" and "compares tracks"
  explicit even from `core`'s own import list.
- Because `runTransfer` takes `MusicProvider` instances as plain
  parameters, it works with the real Spotify provider or a fake test
  provider identically — no test-only code path inside the engine itself.
- Real job persistence, an API layer, and AI-assisted matching are each
  deferred to specific, already-named later phases rather than
  half-built now, keeping `packages/core` and `packages/matching` easy to
  delete or restructure if those later phases change the shape needed.
