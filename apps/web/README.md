# @ekusupo/web

The Ekusupo web dashboard. See `docs/decisions/0021-web-dashboard-and-api-scaffolding.md`
for the build-tooling rationale and `ROADMAP.md` for what's next.

## Status

Foundation only: the app installs, builds, and renders a placeholder
shell. No sign-in, no provider connections, no transfer setup — every
CLAUDE.md §8.2 screen is later, separately-scoped work. `apps/web` never
imports `@ekusupo/core`/`connector-sdk`/provider packages directly
(enforced by `eslint.config.js`) — it will talk to `services/api` over
HTTP once that exists for real, the same client/API-layer boundary
CLAUDE.md §4.3/§4.4 describes.

## Running it

```sh
pnpm --filter @ekusupo/web dev
```

Starts a Vite dev server. `pnpm --filter @ekusupo/web build` produces a
static build in `apps/web/dist/`.
