# ADR-0001: Phase 1 Tooling Stack

Status: Accepted

## Context

CLAUDE.md establishes a documentation-first foundation but never names a
concrete tech stack — README.md's "Current Next Steps" lists "decide the
first technical stack" as an explicitly open step. Before scaffolding the
monorepo's tooling (package manager, TypeScript config, linting, formatting,
test runner), that gap had to be closed for at least the tooling layer
(framework/bundler choices for `apps/web` and `apps/extension` remain
deferred — they're not needed to scaffold empty placeholders).

## Decision

- **Language / module system**: TypeScript, `strict: true`, ESM
  (`"type": "module"`) throughout.
- **Package manager / workspaces**: pnpm workspaces (`pnpm-workspace.yaml`
  covering `apps/*`, `packages/*`, `services/*`).
- **TypeScript build**: a single root `tsconfig.json` using TS project
  references (`tsc -b`), with each package extending a shared
  `tsconfig.base.json`. No per-package build scripts.
- **Linting**: ESLint (flat config) with `typescript-eslint`'s recommended
  rules, plus `eslint-config-prettier` to defer all formatting concerns to
  Prettier.
- **Formatting**: Prettier.
- **Testing**: Vitest, single root config (not multi-project workspace mode
  — not needed yet at this size).
- **Task orchestration**: none yet. A single root `tsc -b` / `eslint .` /
  `vitest run` is sufficient for 11 empty placeholder packages.
- **Node baseline**: >=22 (LTS; pinned via `.nvmrc` and `engines`).
- **TypeScript version**: pinned to `6.0.3`, not the newer `7.x` line.
  `typescript-eslint@8.65.0` does not yet support TypeScript 7's compiler
  API (confirmed by a hard failure on `pnpm lint`) — see
  [typescript-eslint#10940](https://github.com/typescript-eslint/typescript-eslint/issues/10940).
  Revisit this pin once typescript-eslint adds TS 7 support.

## Consequences

- Adding a new package means adding the same three-file pattern (see
  `docs/development-setup.md`) and one line to the root `tsconfig.json`'s
  `references` array — no per-package config duplication beyond that.
- Because there's no build-task orchestrator, `pnpm build`/`pnpm test`
  always run against the whole workspace. This is fine at 11 empty
  packages; revisit if per-package caching/parallelism becomes worth the
  added complexity.
- Framework/bundler choice for `apps/web` and `apps/extension` is still
  open and will need its own ADR before those apps get real implementation.

## Alternatives Considered

- **npm workspaces / Yarn (Berry)** — both viable; pnpm chosen for
  install speed, disk-efficient content-addressed storage, and strict
  dependency isolation (no phantom-dependency access).
- **Biome** (single lint+format tool) — faster and simpler config, but
  ESLint + Prettier chosen for the deeper rule/plugin ecosystem (useful
  once the web app and connector packages have real code to lint).
- **Jest** / **`node:test`** — Jest is more mature but needs more config
  for native ESM/TS; `node:test` has no extra dependency but a much
  thinner feature set. Vitest chosen for native ESM/TS support with
  minimal config and a Jest-compatible API.
- **Turborepo / Nx** — explicitly deferred; would be premature abstraction
  (CLAUDE.md §16.2) before there's a real task graph worth caching.
