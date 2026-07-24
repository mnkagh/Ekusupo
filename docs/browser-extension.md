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
      v  (sendToBackground)
Background Service Worker  <-- owns provider auth/session state, calls
      ^                          the Transfer Engine
      |  (sendToTab)
Popup / Options  <-- user-facing surfaces, talk to background only
      |
shared/  <-- typed messaging contract between the three above
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
- `shared/` — types/contracts shared by the other three: the messaging
  bus, the message catalog, and the provider-agnostic detection registry
  (below). Contains no `chrome.*`-specific behavior beyond wrapping
  `chrome.runtime`/`chrome.tabs` message-passing, and no provider-specific
  code — see "Resource detection."

## What's delivered so far

- **PR1 — Extension foundation**: the extension installs, the popup
  renders, the background service worker runs, and the content script
  injects into a Spotify page.
- **PR2 — Typed messaging layer**: the full message catalog (see
  "Messaging layer" below) and the `sendToBackground`/`sendToTab`/
  `onMessage` bus. No handler actually does anything yet — PR3 is the
  first to implement one for real.
- **PR3 — Resource detection**: a provider-independent detector registry,
  a Spotify detector (playlist/album/track), and SPA-navigation-aware
  wiring in `content-script.ts` — see "Resource detection" below. Still
  no messaging-bus integration; the content script only logs what it
  detects.
- **PR4 — UI injection**: a floating action panel (Transfer / Preview /
  Copy UPF) rendered into a Shadow DOM host on detected pages — see "UI
  injection" below. Buttons send typed messages to `background/`, which
  only acknowledges and logs them for now; no transfer/preview/export
  logic runs yet.

## What's deferred to later PRs

- **PR5 — Transfer integration**: wiring the background worker to
  `@ekusupo/core`'s `runTransfer`, via `@ekusupo/providers/spotify`.
- **PR6 — Progress UI**: surfacing `runTransfer`'s `onProgress` events and
  final `TransferReport` in the popup/injected UI. The UI reflects the
  Transfer Engine's own state machine — it does not invent its own
  progress model (per the user's explicit instruction for this phase).

## Messaging layer

`apps/extension/src/shared/messages.ts` defines one `MessageMap`
interface — every message type's payload and response in one place:

```ts
interface MessageMap {
  DetectCurrentPage: { payload: undefined; response: { resource: DetectedResource | null } };
  StartTransfer: { payload: StartTransferPayload; response: { jobId: string } };
  GetTransferStatus: { payload: { jobId: string }; response: { status: TransferStatus } };
  AuthenticateProvider: { payload: { provider: string }; response: { connected: boolean } };
  ReadPageMetadata: { payload: undefined; response: { resource: DetectedResource | null } };
  InjectUI: { payload: { resource: DetectedResource }; response: { injected: boolean } };
  HighlightPlaylist: { payload: { resourceId: string }; response: { highlighted: boolean } };
  CurrentResource: {
    payload: { resource: DetectedResource | null };
    response: { acknowledged: true };
  };
  UserClickedTransfer: {
    payload: { resource: DetectedResource };
    response: { acknowledged: true };
  };
  TransferProgress: { payload: TransferProgressPayload; response: { acknowledged: true } };
  TransferCompleted: {
    payload: { jobId: string; report: TransferReportSummary };
    response: { acknowledged: true };
  };
  TransferFailed: { payload: { jobId: string; reason: string }; response: { acknowledged: true } };
}
```

Grouped by direction (who sends it, who's expected to handle it):

- **Popup → Background**: `DetectCurrentPage`, `StartTransfer`,
  `GetTransferStatus`, `AuthenticateProvider`.
- **Background → Content**: `ReadPageMetadata`, `InjectUI`,
  `HighlightPlaylist`.
- **Content → Background**: `CurrentResource`, `UserClickedTransfer`.
- **Background → Popup**: `TransferProgress`, `TransferCompleted`,
  `TransferFailed` — push-style; background sends these unsolicited as a
  transfer progresses, rather than in response to a popup request. (A
  known v0.1 limitation: MV3 popups are ephemeral and only receive these
  while actually open. Making progress durable across a closed popup is
  deferred to PR6.)

Two sender helpers, because Chrome's messaging API itself is asymmetric —
this isn't hidden, it's modeled directly:

- `sendToBackground(type, payload)` — used by popup and content, wraps
  `chrome.runtime.sendMessage`.
- `sendToTab(tabId, type, payload)` — used by background to reach a
  specific tab's content script, wraps `chrome.tabs.sendMessage`.
- `onMessage(type, handler)` — used by any context to register a typed
  handler via `chrome.runtime.onMessage`; multiple calls register
  independent listeners that each ignore messages not addressed to them.

No custom request-ID correlation exists or is needed: `chrome.runtime.
sendMessage`/`chrome.tabs.sendMessage` already return a `Promise` scoped
to that specific call's response in Manifest V3.

**Message payloads are always plain, structured-cloneable data — never a
type imported from `@ekusupo/*`, not even type-only.** A live
`MusicProvider` or `AuthSession` instance cannot cross `chrome.runtime`'s
message boundary regardless (it isn't structured-cloneable), so background
holds those and only ever sends small summaries (`TransferStatus`,
`TransferReportSummary`) shaped like, but independent of, `@ekusupo/core`'s
`TransferJobStatus`/`TransferReport`. See ADR-0008.

## Resource detection

`apps/extension/src/shared/detector-registry.ts` defines the
provider-agnostic pipeline:

```ts
interface ResourceDetector {
  readonly provider: string;
  detect(url: string): DetectedResource | null;
}

class DetectorRegistry {
  register(detector: ResourceDetector): void;
  detect(url: string): DetectedResource | null; // first match wins
}
```

Detectors are pure functions of a URL string — no `window`, no `chrome.*`
— which is what makes them (and the registry) testable with plain string
fixtures. Concrete detectors are **not** in `shared/`: the Spotify one
lives at `apps/extension/src/content/detectors/spotify.ts`, the same
relationship `packages/providers/spotify` has to `packages/connector-sdk`
(ADR-0009). Adding Apple Music or YouTube Music detection later is one new
file in `content/detectors/` plus one `registry.register(...)` call — the
registry itself never changes.

`content/spa-navigation-watcher.ts` is the DOM-facing piece: it patches
`history.pushState`/`replaceState` and listens for `popstate`, since
Spotify's router navigates via `pushState` without a full page load or a
native event the content script could otherwise observe. It exposes
`watchLocationChanges(onChange): () => void` — the returned function
un-patches `history` and removes the listener, establishing the cleanup
convention PR4's injected UI will reuse.

`content-script.ts` wires these together: builds a `DetectorRegistry`,
registers `spotifyDetector`, runs detection on load and on every
navigation change, and (for now) just logs the result. It does not yet
send anything over the messaging bus — see PR4 in "What's deferred."

## UI injection

`content/injection-manager.ts` owns showing and hiding a floating action
panel, and nothing else:

```ts
class InjectionManager {
  show(resource: DetectedResource, callbacks: ActionPanelCallbacks): void;
  hide(): void;
}
```

`show()` creates a single host `<div>` appended to `document.body` with
`attachShadow({ mode: "open" })` the first time it's called, then mounts
(or re-renders) a React tree — `ActionPanel` — inside the shadow root.
`hide()` unmounts and removes the host entirely. Both are idempotent:
calling `show()` repeatedly re-renders instead of re-injecting, and
`content-script.ts` calls `hide()` whenever detection stops matching (e.g.
navigating back to Spotify's home page), so the panel disappears and
reappears correctly across SPA navigation without ever duplicating.

The panel is a **fixed-position overlay** (bottom-right), not injected
into a specific spot in Spotify's own markup — there's no reliable way to
verify Spotify's live DOM structure from this environment, and guessing a
selector would be exactly the kind of fragile, provider-specific
assumption this architecture avoids elsewhere. See ADR-0010.

`ActionPanel` (`content/ui/ActionPanel.tsx`) is presentational only:
`{ resource, onTransfer, onPreview, onCopyUpf }`. It has no idea what a
`chrome.runtime` message is — `content-script.ts` supplies callbacks that
call `sendToBackground("UserClickedTransfer" | "PreviewRequested" |
"CopyUpfRequested", { resource })`. `background/service-worker.ts`
currently just acknowledges and logs each — PR5 replaces the
`UserClickedTransfer` stub with a real call into the Transfer Engine;
Preview/Copy UPF stay logging-only until they're scoped to a PR.

Style isolation is bidirectional: Shadow DOM already stops the host
page's CSS from reaching in, and `:host { all: initial; }` in the panel's
own stylesheet stops it from inheriting page styles (font, color) on the
way out.

## Context boundaries

Enforced by ESLint (`eslint.config.js`), not just convention:

- `content/` and `popup/` may **not** import any `@ekusupo/*` package,
  directly or type-only. They only ever know `shared/`'s message types —
  they ask background to do everything else.
- `background/` **may** import `@ekusupo/core`, `@ekusupo/connector-sdk`,
  and `@ekusupo/providers/*` (starting PR5) — it's the only context that
  does.
- `shared/` may not import any `@ekusupo/*` package or reach into a
  sibling context folder (`../popup/*`, `../background/*`, `../content/*`)
  — it stays a leaf, like `packages/upf` is for the backend graph.

## Security boundaries

`background/` is the extension's only privileged context: the only place
holding a real `AuthSession`, the only place with `host_permissions`-gated
network access, and (from PR5) the only place that ever imports a
provider package. `content/` runs inside a page you don't control and
`popup/` is closed as soon as the user clicks away — neither is a safe
place to hold a token. This is the same reasoning as CLAUDE.md §12.1
applied to the extension's own runtime: minimize where credentials can
live, not just how they're transmitted.

## Adding a future provider

The extension's code never changes to add a provider. `background/` only
ever imports `@ekusupo/core` and `@ekusupo/connector-sdk` — never a
specific `@ekusupo/providers/<name>` package by name in extension code
(the concrete provider gets selected by the caller of `runTransfer`, the
same provider-agnosticism guarantee `packages/core` already gives the
backend, CLAUDE.md §3.1). Adding Apple Music or YouTube Music support to
the extension is purely a backend change (a new provider package) plus,
eventually, a UI change to list it as a destination option — not an
extension architecture change.

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
rather than changing the global default. `shared/message-bus.test.ts`
doesn't need `jsdom` at all — it stubs a minimal fake `globalThis.chrome`
directly (the same hand-rolled-fake style used for `MusicProvider` and
`fetch` elsewhere in this repo, rather than a `chrome`-mocking test
dependency) and stays on the default `node` environment.
`background`/`content` are still side-effect stubs with no logic through
PR2 — nothing meaningful to unit test yet; their PR1 deliverable is
verified by manually loading the built extension (see
`apps/extension/README.md`).

## Deferred / Open Questions

- Firefox / other MV3-compatible browsers — out of scope; Chrome/Edge only
  for now, matching the user's own architecture diagram for this phase.
- Icons/branding assets don't exist yet; omitted from the manifest rather
  than faked. Chrome shows a default icon for unpacked extensions.
- Whether `shared/`'s future messaging types should also be usable from
  `apps/web` (Phase 6) isn't decided — revisit once the web dashboard
  exists and the actual overlap becomes concrete.
