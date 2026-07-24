# Browser Extension

This document is architecture and contracts only. For implementation,
read `apps/extension/src` directly — it's the authoritative implementation
of what's described here. See CLAUDE.md §7 for the product-level purpose
and boundaries this extends.

## What is the extension?

The first installable Ekusupo product: a Chrome/Edge (Manifest V3)
extension that detects a supported provider's page (starting with
Spotify) and lets a user act on it — transfer, preview, back up — without
leaving the page. It is a thin client. All business logic (reading a
playlist, matching, transferring) lives in the existing backend packages
(`@ekusupo/core`, `@ekusupo/connector-sdk`, `@ekusupo/matching`,
`@ekusupo/providers/*`) — the extension calls them, it does not
reimplement them (CLAUDE.md §3.3, §7.3).

## Architecture

```text
Content Script  <-- runs on the provider's page, detects + injects UI
      |
Background Service Worker  <-- owns provider auth/session state, calls
      |                          the Transfer Engine
Popup / Options  <-- user-facing surfaces
      |
shared/  <-- typed messaging contract between the three above (PR2)
```

Four runtime surfaces, mirroring `apps/extension/src/`:

- `popup/` — the toolbar popup; the primary quick-action surface.
- `options/` — the extension's settings page.
- `background/` — a Manifest V3 service worker; the only place with
  access to `chrome.*` extension APIs that need elevated context, and the
  only place that calls into `@ekusupo/core`'s `runTransfer`.
- `content/` — injected into supported provider pages; detects what's on
  the page and injects Ekusupo's UI (button, panel). Contains no business
  logic — it messages the background worker and renders what it's told.
- `shared/` — types/contracts shared by the other three. Empty in this PR;
  PR2 adds the typed messaging protocol here.

## What this PR (PR1) delivers

Just the foundation: the extension installs, the popup renders, the
background service worker runs, and the content script injects into a
Spotify page. No detection logic, no messaging protocol, no calls into the
Transfer Engine yet.

## What's deferred to later PRs

- **PR2 — Shared messaging**: a typed message protocol between
  popup/background/content (`DetectPage`, `GetCurrentResource`,
  `StartTransfer`, `GetTransferStatus`), replacing today's empty
  `shared/`.
- **PR3 — Spotify detection**: recognizing playlist/track/album URLs and
  extracting `{ provider, resourceType, resourceId }`.
- **PR4 — UI injection**: an actual Ekusupo action button/panel on the
  page (Transfer / Preview / Copy UPF), still non-functional.
- **PR5 — Transfer integration**: wiring the background worker to
  `@ekusupo/core`'s `runTransfer`, via `@ekusupo/providers/spotify`.
- **PR6 — Progress UI**: surfacing `runTransfer`'s `onProgress` events and
  final `TransferReport` in the popup/injected UI. The UI reflects the
  Transfer Engine's own state machine — it does not invent its own
  progress model (per the user's explicit instruction for this phase).

## Build tooling

Vite + React, with a hand-rolled config rather than a Manifest-V3-specific
Vite plugin (e.g. `@crxjs/vite-plugin`) — see ADR-0007 for the full
reasoning. Two build passes are required, not one:

1. **Main pass** (`vite.config.ts`): `popup.html`, `options.html`, and
   `background.js`, built as normal ES modules with standard Rollup
   chunking. This is safe because Chrome MV3 background service workers
   support `"type": "module"` — they can `import` other emitted chunks
   just like any other web page.
2. **Content-script pass** (`vite.content.config.ts`): `content.js` alone,
   built as a single self-contained IIFE bundle (`emptyOutDir: false`, so
   it doesn't wipe the main pass's output). This is **not** optional —
   Manifest V3 content scripts run as classic scripts, not modules. If
   Rollup ever extracts a shared chunk into `content.js` (e.g. once
   `shared/` is imported by both `content/` and `popup/` in PR2), the
   browser throws a `SyntaxError` on the resulting `import` statement the
   moment the script is injected. Keeping the content script on its own
   single-entry, no-code-splitting build sidesteps this permanently.

`apps/extension/public/manifest.json` is hand-authored and copied verbatim
into `dist/` by Vite's `publicDir` mechanism — no generation step. This
only works because both build passes emit entry files under fixed,
unhashed names (`popup.html`, `options.html`, `background.js`,
`content.js`) that the manifest can reference statically.

## Permissions philosophy

Request only what the current PR actually uses (CLAUDE.md §12.2). PR1
requests nothing beyond `content_scripts` matching
`*://open.spotify.com/*` — no `permissions`, no `host_permissions`. Each
later PR adds exactly the permission its new capability needs, not
proactively.

## Testing approach

The shared root `vitest.config.ts` stays on `environment: "node"` for
every other package. `apps/extension`'s React component tests opt into
`jsdom` per file via a `// @vitest-environment jsdom` pragma comment,
rather than changing the global default. `background`/`content` are
side-effect stubs with no logic in this PR — nothing meaningful to unit
test yet; their PR1 deliverable is verified by manually loading the built
extension (see `apps/extension/README.md`).

## Deferred / Open Questions

- Firefox / other MV3-compatible browsers — out of scope; Chrome/Edge only
  for now, matching the user's own architecture diagram for this phase.
- Icons/branding assets don't exist yet; omitted from the manifest rather
  than faked. Chrome shows a default icon for unpacked extensions.
- Whether `shared/`'s future messaging types should also be usable from
  `apps/web` (Phase 6) isn't decided — revisit once the web dashboard
  exists and the actual overlap becomes concrete.
