# ADR-0004: Connector SDK Design

Status: Accepted

## Context

CLAUDE.md §6.4 sketches an illustrative Connector SDK method list but says
explicitly that exact signatures "must be documented before implementation."
`docs/connector-sdk.md` is that documentation; this ADR records the design
decisions behind it, including four deliberate deviations from CLAUDE.md
§6.4's literal list, per an explicit request to critically review the
design and propose improvements before writing any code.

## Decision

1. **No `normalizeTrack`/`normalizePlaylist` as public SDK methods.** Every
   `MusicProvider` method that returns provider data returns UPF types
   (`Playlist`, `Track`, `Album`, `Artist`) directly. Normalization from a
   provider-native shape into UPF happens inside each provider package's
   method implementation, not as a separately exposed SDK-level operation.
2. **Capability-gated methods are optional (`?`) on `MusicProvider`**, not
   required-with-a-throw. Absence of a method is itself the "not supported"
   signal, backed by `getCapabilities()` as the declarative source of truth.
3. **`AuthSession` is passed explicitly per call**, not stored on the
   provider instance. Connectors are stateless with respect to any one
   session.
4. **`ConnectorErrorCode` is scoped to single-connector-call failures
   only** — it deliberately excludes "match failure" and "partial transfer
   failure" from CLAUDE.md §16.3's fuller list, since those describe
   Transfer Engine outcomes across multiple calls, not one connector call's
   own failure.

Supporting types: `ProviderCapability`/`ProviderCapabilities`/
`ProviderLimits` (capability model, a `Set` not a method — needs to be
inspectable for a future capability-matrix UI); `AuthMethod`/`AuthInput`/
`AuthSession` (opaque envelope, no OAuth implementation); `PageRequest`/
`Page<T>` (opaque cursor-based pagination); `SearchQuery`/
`CreatePlaylistInput`/`UpdatePlaylistInput` (shared write/search input
shapes).

## Extended dependency graph

ADR-0002 established `packages/core → packages/connector-sdk →
packages/providers/<name>`. This phase adds `packages/upf` beneath all of
it, since `connector-sdk`'s method signatures need `Playlist`/`Track`/
`Album`/`Artist`:

```text
packages/upf
      ^
      |
packages/connector-sdk  (adds a real dependency on @ekusupo/upf)
      ^
      |
packages/core
      ^
      |
packages/providers/<name>  (depends on connector-sdk + upf, not core)
```

`packages/upf` is now the graph's leaf: nothing it exports may depend on
`connector-sdk`, `core`, or any provider. Enforced with one more scoped
ESLint rule alongside the ones ADR-0002 introduced — `packages/upf/**` is
blocked from importing `@ekusupo/core`, `@ekusupo/connector-sdk`, or
`@ekusupo/provider-*`. This is an extension of ADR-0002's enforcement
mechanism, not a change to ADR-0002's own decision, so ADR-0002 itself is
left unmodified.

## Alternatives Considered

- **Exposing `normalizeTrack`/`normalizePlaylist` as SDK methods taking a
  generic/`unknown` provider-native input** — rejected. A method signature
  like `normalizeTrack(raw: unknown): Track` adds no real type safety over
  just doing the conversion inline inside `getPlaylist` etc., while
  implying the SDK has an opinion about a "raw" shape it actually has none
  of. Simpler to just say: SDK methods return UPF, period.
- **Required methods with a standardized `throw new ConnectorError(...)`
  stub for unsupported operations** — rejected in favor of optional
  methods; forces boilerplate on every connector that doesn't support an
  operation, for no real safety benefit over TypeScript's own optional-
  property narrowing.
- **Stateful provider instances** (`provider.authenticate()` mutates
  internal state, subsequent calls read it) — rejected; breaks multi-account
  support without spinning up one provider instance per connected account,
  and hides state that's easier to reason about as an explicit parameter.
- **Reusing CLAUDE.md §16.3's full error category list verbatim** —
  rejected; "match failure" and "partial transfer failure" don't have a
  meaningful value at the single-connector-call level this package
  operates at. Kept the connector-level subset only.

## Consequences

- Provider packages carry all responsibility for normalization and error
  mapping — the SDK enforces the _shape_ of the outcome (UPF types in,
  UPF types out; `ConnectorError` for failures) but not how a connector
  gets there.
- Core, and anything built on top of it, only ever needs to know
  `MusicProvider` + UPF types to work with any provider — adding the 3rd,
  10th, or 20th provider requires zero changes to `packages/connector-sdk`
  or `packages/core`.
- `packages/upf` picking up new consumers (`connector-sdk`, later `core`)
  without picking up any new dependencies of its own keeps it easy to
  reason about and test in isolation.
