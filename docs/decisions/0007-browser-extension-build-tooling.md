# ADR-0007: Browser Extension Build Tooling

Status: Accepted

## Context

Phase 5 introduces the first frontend / browser-runtime code in the
repo — `apps/extension`, a Manifest V3 Chrome/Edge extension. Nothing
built so far (UPF, Connector SDK, providers, matching, transfer) touched
React, a bundler, or a DOM-aware TypeScript config, so this phase needs a
real build-tooling decision, not just application code.

## Decision

- **Vite + React**, as specified by the user's Phase 5 brief.
- **No Manifest-V3-specific Vite plugin** (e.g. `@crxjs/vite-plugin`,
  `vite-plugin-web-extension`). The build is hand-configured instead.
- **Two Vite build passes**:
  1. A main pass (`vite.config.ts`) building `popup.html`, `options.html`,
     and `background.js` together as normal ES modules with standard
     Rollup chunking.
  2. A content-script pass (`vite.content.config.ts`) building
     `content.js` alone, in library/IIFE mode, as one fully self-contained
     file with `emptyOutDir: false`.
- **`manifest.json` lives in `apps/extension/public/`**, hand-authored,
  copied verbatim into `dist/` by Vite's `publicDir` mechanism. Entry
  filenames are pinned unhashed (`rollupOptions.output.entryFileNames`) so
  the static manifest never needs regenerating.

## Why two passes

Chrome MV3 background service workers support `"type": "module"` in the
manifest, so `background.js` can safely `import` other chunks — it builds
fine alongside `popup`/`options` in one pass with normal code-splitting.

Content scripts cannot. Manifest V3 executes `content_scripts[].js` files
as classic scripts, not modules. The instant Rollup extracts a shared
chunk into `content.js` — which will happen automatically the moment
`content/` and another entry (e.g. `popup/`) both import the same module
from the future `shared/` messaging layer (PR2) — the browser throws a
`SyntaxError` on the resulting `import` statement at injection time. This
isn't a hypothetical: it's the default behavior of any multi-entry Rollup
build the moment two entries share an import. Isolating `content.js` into
its own single-entry, no-chunking build sidesteps the failure mode
permanently rather than requiring careful never-share-an-import discipline
across the whole codebase indefinitely.

## Alternatives Considered

- **`@crxjs/vite-plugin` or similar** — rejected. These solve exactly this
  class of problem (manifest generation, content-script isolation, HMR)
  automatically, but add a dependency on a smaller, less predictable
  ecosystem plugin for something solvable directly with a few dozen lines
  of Vite config. Consistent with this repo's existing bias toward
  minimal, well-understood tooling (ADR-0001, ADR-0002). Worth revisiting
  if content-script HMR/DX pain becomes real once PR2+ adds substantial
  logic to `content/`.
- **A single Vite pass for everything** — rejected; works today only
  because the content script currently has zero imports. It would silently
  break the first time `content/` imports anything shared with another
  entry, with a failure that only manifests at runtime in the browser, not
  at build time — an easy trap for a future contributor to fall into.
- **Generating `manifest.json` from a template/plugin** — rejected for
  now; a static, hand-authored manifest is simpler while permissions and
  entry points change slowly. Revisit if the manifest starts needing
  build-time values (e.g. a version synced from `package.json`).

## Consequences

- `apps/extension`'s `build` script is two commands
  (`vite build && vite build --config vite.content.config.ts`), not one —
  documented in `apps/extension/README.md` so it isn't mistaken for
  redundant.
- Anyone adding real logic to `content/` must remain aware it can only
  import modules that don't pull in anything from `background/`/`popup/`
  transitively in a way that would otherwise get chunked — in practice,
  this is automatic as long as `content/` keeps building through
  `vite.content.config.ts`'s isolated, single-entry pass.
- `apps/extension` gains its own dependency set (`react`, `react-dom`,
  `vite`, `@vitejs/plugin-react`, `@types/chrome`, React types, RTL);
  `eslint-plugin-react-hooks`/`eslint-plugin-react-refresh`/`jsdom` are
  added at the workspace root because the shared root `eslint.config.js`/
  `vitest.config.ts` are what reference them (same reasoning as
  `@types/node` needing to be root-level for `tsc -b` to resolve it).
