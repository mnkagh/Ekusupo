# ADR-0002: Provider Package Boundaries

Status: Accepted

## Context

While scoping Phase 2 (repository foundation), we caught a mistake before it
happened: the original plan had no explicit home for provider connector
code, which risked it drifting into `packages/core` over time — exactly what
CLAUDE.md §3.1 ("Provider Agnostic Core") and §3.2 ("No Primary Provider")
forbid. `packages/connector-sdk` already exists as the contract layer
(CLAUDE.md §6), but nothing enforced that `packages/core` couldn't reach
past it and import a provider directly.

## Decision

- Provider connectors live at `packages/providers/<name>/` (e.g.
  `packages/providers/spotify/`), never inside `packages/core`, and never as
  top-level `packages/<provider-name>` siblings of `core`/`connector-sdk` —
  grouping them under `packages/providers/` makes "these are all the same
  kind of thing" visible at a glance as the provider count grows.
- Proposed package naming convention: `@ekusupo/provider-<name>` (e.g.
  `@ekusupo/provider-spotify`), matching the existing `@ekusupo/<name>`
  pattern used by every other workspace package. Not yet exercised by a real
  package — first confirmed when the first connector is actually built.
- Dependency direction is one-way:

  ```text
  packages/core  -->  packages/connector-sdk  -->  packages/providers/<name>
  ```

  `packages/core` may depend on `packages/connector-sdk`. Nothing may depend
  back on `packages/core` from `connector-sdk` or from a provider package.
  No provider package may be imported by `packages/core` directly — only
  through the connector-sdk contract.

- `packages/*` must never depend on `apps/*` or `services/*` — dependencies
  only flow the other way (apps/services consume packages, not vice versa).

## Enforcement

Added scoped `no-restricted-imports` rules in `eslint.config.js`:

- Every `packages/**` file is blocked from importing `@ekusupo/web`,
  `@ekusupo/extension`, `@ekusupo/desktop`, `@ekusupo/api`, or
  `@ekusupo/worker`.
- `packages/core/**` is blocked from importing any `@ekusupo/provider-*`.
- `packages/connector-sdk/**` is blocked from importing `@ekusupo/core` or
  any `@ekusupo/provider-*`.
- `packages/providers/**` is blocked from importing `@ekusupo/core`
  directly (this rule is currently a no-op — no provider package exists
  yet — but takes effect automatically the moment one is added).

This is a small, explicit ESLint rule set rather than a dedicated
boundaries plugin (e.g. `eslint-plugin-boundaries`) — proportionate to 4
rules today. Revisit if the dependency matrix grows past what
`no-restricted-imports` can express clearly.

## Consequences

Adding the 3rd, 10th, or 20th provider means adding one new
`packages/providers/<name>` package that implements the connector-sdk
contract, with zero changes to `packages/core`. A future accidental
`packages/core` → provider import, or a provider → `packages/core` import,
fails lint immediately instead of being caught in review or, worse, not at
all.

## Alternatives Considered

- **Provider code inside `packages/core`** — explicitly forbidden by
  CLAUDE.md §3.1; the reason this ADR exists.
- **Top-level `packages/<provider-name>` siblings** (e.g. `packages/spotify`
  next to `packages/core`) — works, but doesn't visually group providers as
  provider count grows, and makes it easy to accidentally treat one as
  "special" per CLAUDE.md §3.2.
- **`eslint-plugin-boundaries` / `dependency-cruiser`** — more declarative
  and scales better past a handful of rules, but adds a new
  dependency/config paradigm for a ruleset that's currently 4 lines. Worth
  revisiting once the provider count and rule count both grow.
