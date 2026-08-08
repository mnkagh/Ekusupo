# ADR-0021: Web Dashboard and API Scaffolding

Status: Accepted

## Context

ADR-0017 picked the stack (React + Vite, Fastify, PostgreSQL, own
session auth) but explicitly deferred scaffolding to "a separate,
dedicated ADR per app once each is actually built out." This is that
ADR — the PR1-equivalent foundation, mirroring what ADR-0007 was for
`apps/extension`: get both apps installing, building, and running with a
minimal skeleton before any real feature work.

## Decision

**`apps/web`**

1. Plain Vite + React SPA — one build pass, unlike `apps/extension`'s two
   (ADR-0007). There's no MV3-style constraint here forcing a content
   script into its own isolated bundle; a dashboard is just a normal web
   page.
2. `tsconfig.json` uses a throwaway `outDir: "out"` for `tsc -b`'s
   cross-package type-checking, the same pattern `apps/extension` already
   established — Vite's own `vite build` produces the real `dist/`.
3. `App.tsx` renders a placeholder shell only. No routing, no data
   fetching, no `packages/ui` usage yet (see "What's deferred").
4. **New ESLint rule, `webNeverImportsBackendPackagesDirectly`**: blocks
   `@ekusupo/core`/`connector-sdk`/`provider-*`/`matching` imports from
   `apps/web/**` — enforced from the very first commit, unlike
   `apps/extension`'s equivalent rules (`extensionContentStaysThin`
   etc.), which only arrived in later PRs once there was a reason to
   need them. `apps/web` has no privileged context like `background/`;
   it only ever talks to `services/api` over HTTP (CLAUDE.md §4.3/§4.4),
   so there was no reason to wait.

**`services/api`**

1. Fastify, chosen in ADR-0017 for staying TypeScript end-to-end. A
   `buildServer()` factory (not a module-level singleton) so tests use
   Fastify's `.inject()` instead of binding a real port — the same
   "no live network involved" testing posture used throughout this repo.
2. One route: `GET /health`. Nothing else yet.
3. `tsx` for `dev` (fast iteration, no separate compile step);
   `tsc -b` + `node dist/index.js` for a production-style run — the
   plain-package pattern every other `packages/*` already uses, since a
   Node backend (unlike a browser app) doesn't need a bundler at all.

**Both verified with a real smoke test**, not just `tsc`/lint: `vite
build` actually produced a working `dist/`, and the Fastify server was
actually started (via `tsx`) and answered `GET /health` for real, not
just via `.inject()` in a test process.

**Shared**: `reactAppRules` (was `browserExtensionReactRules`, renamed)
now covers both `apps/extension` and `apps/web` — one place for
`react-hooks`/`react-refresh` rules instead of duplicating the block per
app. `pnpm-workspace.yaml`'s `allowBuilds.esbuild` placeholder (present
but unset since the repo's initial scaffolding) is set to `true` —
esbuild is Vite's own build dependency, already implicitly trusted via
`apps/extension`'s existing Vite usage; `apps/web`'s fresh install was
just the first one to actually trigger pnpm's supply-chain gate on it.

## What's deferred (deliberately, not silently)

- **Data model / Drizzle schema.** ADR-0017 picked PostgreSQL, but no
  schema, migration, or live connection exists yet. Designing it now,
  disconnected from a real feature that needs it, would be exactly the
  premature abstraction CLAUDE.md §16.2 warns against — the same
  reasoning `packages/core`'s `InMemoryTransferJobStore` used to defer a
  real store until `services/api` existed to back one. Do this once the
  first data-touching feature (most likely: connecting a provider
  account) is actually being built.
- **Auth.** ADR-0017 picked own session-based auth; no sign-in route,
  session middleware, or password handling exists yet — its own future
  ADR once it's being built for real, not assumed here.
- **Real API routes.** `GET /health` only. "Connect provider account,"
  "start transfer," etc. (CLAUDE.md §4.4) come with the data model and
  auth work above.
- **`packages/ui`.** Still an empty placeholder. Populating it makes
  sense once there's real duplication pressure between `apps/web` and
  `apps/extension`'s UI, not preemptively.
- **`docs/web-app.md` / `docs/api.md`.** ADR-0017 anticipated these;
  they're worth writing once there's enough real behavior to document,
  not for a two-route skeleton.

## Consequences

- `apps/web` and `services/api` both go from empty `PACKAGE_NAME`
  placeholders to real, running, tested code — the next feature (most
  likely provider connection + auth) has somewhere real to attach to.
- Root `pnpm build`/`lint`/`test` cover both without any new top-level
  scripts — they're already in `pnpm-workspace.yaml` and the root
  `tsconfig.json`'s project references from the original repo
  scaffolding.
- This is intentionally a small PR, matching `apps/extension`'s own PR1
  in scope — the much larger remaining work (data model, auth, real
  screens) stays explicitly future, sequenced work, not rushed into this
  pass.
