# ADR-0005: Provider Manifest and Profile Retrieval

Status: Accepted

## Context

Reviewing ADR-0004 ahead of building the first provider package, two gaps
surfaced: (1) there was no static, pre-instantiation way to describe a
connector (name, capabilities, auth methods, links) — useful for a future
provider-selection UI, capability matrix, or plugin marketplace (CLAUDE.md
§2.3) without authenticating every listed provider just to render a list;
(2) Phase 3C's scope includes "profile retrieval," which needs a home in
the contract rather than being a Spotify-only one-off.

## Decision

1. **`ProviderManifest`** — static metadata: `name`, `displayName`,
   `version`, `authenticationMethods`, `supportedCapabilities`, `website?`,
   `documentation?`, `icon?`. `MusicProvider` gets a `readonly manifest:
ProviderManifest` field, **replacing** the previous standalone `readonly
id`/`readonly displayName` fields (consolidated, not duplicated).
   Provider packages are expected to also export their manifest as a
   standalone value (not just reachable via an instance), so it can be read
   without constructing or authenticating a provider.
2. **`manifest.supportedCapabilities` vs. `getCapabilities()`** — kept as
   two distinct things rather than merged into one. The manifest field is
   the static ceiling (what the integration is built for); `getCapabilities()`
   remains the authoritative runtime value a caller must check before acting,
   and should never exceed the manifest by convention (not enforced in code
   — that would be validation logic, out of scope for a types-only package).
3. **`ProviderProfile` / `MusicProvider.getProfile?`** — optional,
   capability-gated (`"profile.read"`) like every other capability. Lives in
   `packages/connector-sdk`, not `packages/upf` — it describes account
   identity, not music library data, which is outside UPF's stated scope
   (`docs/universal-playlist-format.md`).

## Alternatives Considered

- **Fold manifest fields directly onto `MusicProvider`** (keep `id`,
  `displayName`, add `version`, `website`, etc. as more top-level fields) —
  rejected. Doesn't solve the actual problem (reading metadata without an
  instance); a nested, independently-exportable `ProviderManifest` does.
- **Drop `getCapabilities()` in favor of `manifest.supportedCapabilities`
  only** — rejected. Would conflate "what this integration can theoretically
  do" with "what's actually available right now for this session," which
  can legitimately differ (narrower OAuth scopes, account-tier limits).
- **Keep profile retrieval Spotify-internal, not part of `MusicProvider`**
  — considered; rejected in favor of generalizing now, since a pattern only
  one provider can express isn't really part of the shared contract, and
  retrofitting it once a second provider needs it is more disruptive than
  adding one optional method now.
- **Model `ProviderProfile` in `packages/upf`** — rejected; account identity
  isn't playlist/library data, and UPF's v0.1 scope is deliberately narrow
  (ADR-0003).

## Consequences

- `packages/connector-sdk/src/index.test.ts`'s fake provider updates from
  `{ id, displayName }` to `{ manifest: { name, displayName, ... } }` — a
  breaking change to the SDK's shape, acceptable pre-release (nothing
  outside this repo depends on it yet).
- Every future provider package is expected to export a standalone manifest
  value as a matter of convention, documented in `docs/connector-sdk.md`.
