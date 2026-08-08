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
- **PR5 — Transfer integration**: `UserClickedTransfer` now runs a real
  `@ekusupo/core` Dry Run via `@ekusupo/provider-spotify` — see "Transfer
  integration" below and ADR-0012. Preview and Copy UPF stay
  logging-only; they aren't scoped to a PR yet.
- **PR6 — Progress UI**: the injected panel now shows PR5's Dry Run
  progress live — a disabled Transfer button with the current step while
  running, a match/skip/fail summary on completion, or the failure reason
  on failure — see "Progress UI" below and ADR-0013. The popup also shows
  the active tab's last known status, via `chrome.storage.session` — see
  ADR-0015.
- **PR7 — Real OAuth**: `options/` runs a real PKCE login flow via
  `chrome.identity.launchWebAuthFlow` — paste a Spotify Client ID,
  connect, and `UserClickedTransfer` uses a real session instead of
  failing with "isn't connected yet." See "OAuth flow" below and
  ADR-0019/ADR-0020.

## What's deferred to later PRs

Browser Extension MVP (v0.2.0-alpha, per `ROADMAP.md`) is feature
complete through PR7. What's left is out of this phase's scope:

- Live Transfer, a destination picker, and a second provider — v0.3.0-alpha
  (partially done at the platform level — see `ROADMAP.md` — not yet
  wired into the extension's UI).

## Messaging layer

`apps/extension/src/shared/messages.ts` defines one `MessageMap`
interface — every message type's payload and response in one place:

```ts
interface MessageMap {
  DetectCurrentPage: { payload: undefined; response: { resource: DetectedResource | null } };
  StartTransfer: { payload: StartTransferPayload; response: { jobId: string } };
  GetTabTransferState: { payload: { tabId: number }; response: { state: TransferPanelState } };
  AuthenticateProvider: {
    payload: {
      provider: string;
      code: string;
      redirectUri: string;
      codeVerifier: string;
      clientId: string;
    };
    response: { connected: boolean };
  };
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
  `GetTabTransferState`.
- **Options → Background**: `AuthenticateProvider` — sent once `options/`
  has already run the PKCE redirect itself; see "OAuth flow" below.
- **Background → Content**: `ReadPageMetadata`, `InjectUI`,
  `HighlightPlaylist`.
- **Content → Background**: `CurrentResource`, `UserClickedTransfer`.
- **Background → Content**: `TransferProgress`, `TransferCompleted`,
  `TransferFailed` — push-style; background sends these unsolicited as a
  transfer progresses, to the tab that started it (`sender.tab?.id`, see
  "Progress UI"). Background also persists the same state via
  `chrome.storage.session`, keyed by tab — so a popup opened at any
  point can ask for it with `GetTabTransferState` even though it isn't
  pushed these messages directly (MV3 popups are ephemeral; a push sent
  while one is closed would just be lost). See ADR-0015.

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
holds those and only ever sends small summaries (`TransferPanelState`,
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

## Transfer integration

`background/transfer-orchestrator.ts` has no `chrome.*` dependency —
`runDryRunTransferForResource(resource, deps)` takes plain injected
functions (`getProvider`, `getSession`, `onProgress`, `onCompleted`,
`onFailed`) and calls `@ekusupo/core`'s `runDryRunTransfer` directly (not
`runTransfer` — PR5 resumes browser-extension integration with Dry Run
specifically, per ADR-0011 and ADR-0012). This keeps it unit-testable
with a fake `MusicProvider`, the same technique `packages/core`'s own
tests use, with no `chrome` faking needed.

`service-worker.ts` supplies the real dependencies:

- `background/provider-registry.ts` — the one place a provider package is
  named. `getProvider(name, config?)` resolves a name to an
  already-built `MusicProvider`; `config` (currently just `clientId`)
  exists for the auth exchange (see "OAuth flow" below) — nothing outside
  this file imports a provider package itself.
- `background/session-store.ts` — an in-memory `Map<provider,
AuthSession>`, populated by a real login as of PR7 — see "OAuth flow".
  Before that existed, `UserClickedTransfer` failed with a clear, honest
  reason ("spotify isn't connected yet…") instead of a fake or silent
  success; that path still runs for anyone who hasn't connected yet
  (ADR-0012).
- Source and destination are always the same connected provider — there's
  no destination picker yet, and `docs/transfer-engine.md` already
  documents same-provider Dry Run as valid scope.

`manifest.json` gained `host_permissions: ["https://api.spotify.com/*"]`
in PR5 — the first PR whose code path actually performs a cross-origin
fetch from the background worker.

Outcomes (`onProgress`/`onCompleted`/`onFailed`) now also reach the tab
that started the transfer as real messages — see "Progress UI" below.

## Progress UI

`service-worker.ts` sends `TransferProgress` / `TransferCompleted` /
`TransferFailed` to `sender.tab?.id` (captured from the original
`UserClickedTransfer` message) as `runDryRunTransferForResource`'s
callbacks fire, tagged with a locally generated attempt id (the Transfer
Engine's own `TransferJob.id` isn't known until the call resolves — see
ADR-0013).

`content-script.ts` registers handlers for all three and calls
`injectionManager.updateTransferState(state)`, where `TransferPanelState`
(`shared/messages.ts`) is a small union — `idle | running | completed |
failed` — built directly from the wire payloads. No new progress
vocabulary is invented on top of what the engine already reports, per the
user's explicit instruction for this phase. There's at most one active
transfer per tab, so nothing correlates by job id — whatever message
arrives applies to whatever the panel currently shows.

`InjectionManager` remembers the last shown `resource`/`callbacks` so
`updateTransferState()` can re-render in place; a fresh `show()` (a newly
detected resource) resets state back to `idle`. Clicking Transfer also
sets `running` optimistically before the round-trip completes, so the
button responds immediately rather than appearing inert.

`background/tab-transfer-status-store.ts` persists the same
`TransferPanelState`, keyed by tab, to `chrome.storage.session` at the
same point it's pushed to the tab. `popup/Popup.tsx` asks for it
(`GetTabTransferState`) on mount, using `chrome.tabs.query({ active:
true, currentWindow: true })` to find which tab it's looking at — so
opening the popup at any point shows the real current state, not just
whatever happened to be pushed while it was open. See ADR-0015 for why
`chrome.storage.session` specifically, and both this and `ActionPanel.tsx`
share one formatting function (`shared/transfer-panel-state.ts`) so the
two surfaces can't describe the same state differently.

## OAuth flow

`options/` runs the whole PKCE dance (RFC 7636) and hands background only
an already-obtained authorization code — see ADR-0014/ADR-0019/ADR-0020.

- `options/pkce.ts` — pure functions (`generateCodeVerifier`,
  `computeCodeChallenge`, `buildAuthorizeUrl`), no `chrome.*` dependency.
- `options/spotify-connect.ts` — `connectSpotify(clientId, deps)` takes
  every browser call injected (`launchWebAuthFlow`, `getRedirectURL`,
  `authenticate`), the same split `transfer-orchestrator.ts` uses. Builds
  the authorize URL, runs `chrome.identity.launchWebAuthFlow`, parses
  `code` out of the redirect, and sends `AuthenticateProvider` to
  background. Returns `false` — never throws — for every failure mode
  (user cancels, denies access, or the exchange itself fails).
- `options/client-id-store.ts` — the Client ID (public by design, not a
  secret) lives in `chrome.storage.local`, unlike the deliberately
  session-scoped `tab-transfer-status-store.ts`.
- `background/service-worker.ts`'s `AuthenticateProvider` handler is the
  only place that actually calls `provider.authenticate(...)` and stores
  the resulting session in `SessionStore` — completing what ADR-0012
  left as "isn't connected yet."

Registering a Spotify Developer app to get a Client ID is still the
user's own action — nothing in this repository does or can do that step
(ADR-0014).

## Context boundaries

Enforced by ESLint (`eslint.config.js`), not just convention:

- `content/`, `popup/`, and `options/` may **not** import any
  `@ekusupo/*` package, directly or type-only. They only ever know
  `shared/`'s message types — they ask background to do everything else.
  (`options/` never had this stated as its own rule until PR7 —
  `extensionOptionsStaysThin` — an oversight, not a deliberate exception;
  its code already satisfied it.)
- `background/` **may** import `@ekusupo/core`, `@ekusupo/connector-sdk`,
  and `@ekusupo/provider-*` (since PR5) — it's the only context that does.
- `shared/` may not import any `@ekusupo/*` package or reach into a
  sibling context folder (`../popup/*`, `../background/*`, `../content/*`)
  — it stays a leaf, like `packages/upf` is for the backend graph.

## Security boundaries

`background/` is the extension's only privileged context: the only place
holding a real `AuthSession` (via `session-store.ts` — currently always
empty, see "Transfer integration" above), the only place with
`host_permissions`-gated network access, and (since PR5) the only place
that ever imports a provider package. `content/` runs inside a page you
don't control and
`popup/` is closed as soon as the user clicks away — neither is a safe
place to hold a token. This is the same reasoning as CLAUDE.md §12.1
applied to the extension's own runtime: minimize where credentials can
live, not just how they're transmitted.

## Adding a future provider

`background/provider-registry.ts` is the only place a provider package is
named — a `Record<string, () => MusicProvider>` map, one entry per
provider. `transfer-orchestrator.ts`, `session-store.ts`, and everything
else only ever see an already-resolved `MusicProvider` or a plain name
string, never a package import (the same provider-agnosticism guarantee
`packages/core` already gives the backend, CLAUDE.md §3.1). Adding Apple
Music or YouTube Music support to the extension is a backend change (a
new provider package) plus one new line in `provider-registry.ts` plus,
eventually, a UI change to list it as a destination option — not a change
to the orchestrator or any test written against it.

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
proactively. PR5 added `host_permissions: ["https://api.spotify.com/*"]`
— the first PR whose background code actually calls the Spotify API. PR6
added `"permissions": ["storage"]` — the first PR whose code reads/writes
`chrome.storage` (ADR-0015). PR7 added `"permissions": ["identity"]` (the
PKCE redirect flow) and `host_permissions` for
`https://accounts.spotify.com/*` (the token exchange endpoint, present in
`packages/providers/spotify` since v0.1 but genuinely unreachable from
the extension until something finally called it — ADR-0020).

## Testing approach

The shared root `vitest.config.ts` stays on `environment: "node"` for
every other package. `apps/extension`'s React component tests opt into
`jsdom` per file via a `// @vitest-environment jsdom` pragma comment,
rather than changing the global default. `shared/message-bus.test.ts`
doesn't need `jsdom` at all — it stubs a minimal fake `globalThis.chrome`
directly (the same hand-rolled-fake style used for `MusicProvider` and
`fetch` elsewhere in this repo, rather than a `chrome`-mocking test
dependency) and stays on the default `node` environment.
`background`/`content`'s own entry files (`service-worker.ts`,
`content-script.ts`) stay untested glue over `chrome.*` — the same split
PR3 established: real logic lives in plain, injectable functions
(`transfer-orchestrator.ts`, `InjectionManager`) that unit tests exercise
directly, and the thin entry files that wire them to `chrome.*` are
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
- Registering an actual Spotify Developer app for a Client ID — the only
  remaining piece of ADR-0014 nothing in this repository can do; it's the
  user's own action, still open.
- A destination picker and a second provider in the extension's own UI —
  `@ekusupo/provider-upf-file` and the Transfer Engine's write-through
  mode (ADR-0016, ADR-0018) exist at the platform level, but nothing in
  `apps/extension` surfaces a choice of destination yet — v0.3.0-alpha.
