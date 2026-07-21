# Development Setup

## Prerequisites

- Node.js >= 22 (see `.nvmrc`). Node ships [Corepack](https://nodejs.org/api/corepack.html),
  which manages the pinned package manager for you.
- Run `corepack enable` once per machine. This lets Corepack read the
  `packageManager` field in `package.json` and transparently fetch/use the
  exact pinned pnpm version — no separate global pnpm install needed.

## Install

```sh
pnpm install
```

This installs dependencies for every workspace package in one pass and
links the workspace packages (`@ekusupo/*`) to each other via symlinks.

## Root scripts

Run from the repo root — they operate across the whole workspace:

| Script              | What it does                                              |
| ------------------- | --------------------------------------------------------- |
| `pnpm build`        | `tsc -b` — builds every package via TS project references |
| `pnpm clean`        | `tsc -b --clean` — removes build output/incremental state |
| `pnpm lint`         | ESLint across the repo                                    |
| `pnpm lint:fix`     | ESLint with autofix                                       |
| `pnpm format`       | Prettier, writes changes                                  |
| `pnpm format:check` | Prettier, check only (used in CI)                         |
| `pnpm test`         | Vitest, single run                                        |
| `pnpm test:watch`   | Vitest, watch mode                                        |

There's no per-package build/test orchestrator (Turborepo/Nx) yet — at this
size a single root `tsc -b` and a single root `vitest run` are enough. Add
one later if/when the task graph and caching needs justify it.

## Repository layout

```text
apps/       — client applications (web, extension, desktop)
packages/   — shared libraries (core, connector-sdk, upf, matching, shared, ui)
services/   — backend services (api, worker)
docs/       — durable project documentation, including docs/decisions/ (ADRs)
infra/      — deployment and infrastructure config (not yet used)
scripts/    — dev/build/maintenance scripts (not yet used)
tests/      — cross-package integration/e2e tests (not yet used)
examples/   — example UPF documents and connector usage (not yet used)
```

See each directory's own `README.md` for its specific purpose, and
[`CLAUDE.md`](../CLAUDE.md) §14.1 for the full rationale.

## Adding a new workspace package

Every package under `apps/`, `packages/`, or `services/` follows the same
three-file pattern:

1. `package.json` — `{"name": "@ekusupo/<name>", "version": "0.0.0", "private": true, "type": "module", "main": "./dist/index.js", "types": "./dist/index.d.ts"}`
2. `tsconfig.json` — extends the root `tsconfig.base.json`, sets `outDir`/`rootDir`
3. `src/index.ts` — at minimum, a real entry point

Then add `{ "path": "<relative/path>" }` to the root `tsconfig.json`'s
`references` array so `pnpm build` picks it up.

## What's still undecided

The framework/bundler choice for `apps/web` and `apps/extension` (React vs.
something else, Vite vs. another bundler, the browser-extension manifest
approach) has not been made yet — see README.md's "Current Next Steps". This
Phase 1 setup deliberately doesn't assume an answer.
