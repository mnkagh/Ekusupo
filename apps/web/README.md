# @ekusupo/web

The Ekusupo web dashboard. See `docs/decisions/0021-web-dashboard-and-api-scaffolding.md`
for the build-tooling rationale and `ROADMAP.md` for what's next.

## Status

Real sign-up/sign-in/sign-out against `services/api` (ADR-0023) — a
single screen, no client-side routing yet. No provider connections, no
transfer setup — the rest of CLAUDE.md §8.2 is later, separately-scoped
work. `apps/web` never imports `@ekusupo/core`/`connector-sdk`/provider
packages directly (enforced by `eslint.config.js`); it only ever talks to
`services/api` over HTTP, the client/API-layer boundary CLAUDE.md
§4.3/§4.4 describes.

## Running it

```sh
pnpm --filter @ekusupo/api dev    # in one terminal — port 3000
pnpm --filter @ekusupo/web dev    # in another — port 5173
```

Both need to be running for sign-in to actually work locally — `apps/web`
defaults to calling `http://localhost:3000` (`src/api/config.ts`,
override with `VITE_API_BASE_URL`), and `services/api`'s CORS defaults to
allowing `http://localhost:5173` (`src/server.ts`).

`pnpm --filter @ekusupo/web build` produces a static build in
`apps/web/dist/`.
