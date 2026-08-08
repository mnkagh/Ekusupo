# ADR-0009: Resource Detection System

Status: Accepted

## Context

PR3 needs the extension to recognize what a supported provider's page is
currently showing (a playlist, album, or track) without hardcoding that
logic inline in the content script — the brief is explicit that Spotify
must be "only the first implementation" and that future providers must be
able to register a detector "without modifying the existing detection
pipeline."

Numbering note: this branch's own history runs 0001-0005, 0007, 0008 —
0006 is used by `feature/transfer-engine`'s (not yet merged) ADR for the
Transfer/Matching Engine. This ADR is numbered 0009, continuing from this
branch's own last number, to avoid a collision once both feature branches
merge into `develop`.

## Decision

1. **`ResourceDetector` interface + `DetectorRegistry` class live in
   `apps/extension/src/shared/detector-registry.ts`** — provider-agnostic,
   pure (`detect(url: string): DetectedResource | null`, no DOM/chrome
   dependency). `DetectorRegistry.detect(url)` runs registered detectors
   in registration order and returns the first non-null match.
2. **The Spotify detector does not live in `shared/`.** It lives at
   `apps/extension/src/content/detectors/spotify.ts`. This mirrors
   `packages/providers/spotify`'s role in the backend: `shared/` is the
   neutral contract (like `connector-sdk`), individual provider detectors
   are the concrete implementations (like a provider package).
   `connectorSdkStaysProviderNeutral` (ADR-0004) already establishes this
   principle for the backend; this is the same principle applied to the
   extension's own detection layer, not a new one.
3. **Detectors are pure functions of a URL string**, not of `window.
location` — the registry and every detector are testable with plain
   string fixtures, no jsdom required.
4. **SPA navigation is observed by patching `history.pushState`/
   `replaceState`**, plus a `popstate` listener, in
   `content/spa-navigation-watcher.ts`. Returns an unsubscribe function
   that restores the original `history` methods and removes the listener.
5. **`content-script.ts` only logs the detected resource in this PR** —
   no messaging-bus integration yet. See "Consequences."

## Alternatives Considered

- **Polling `location.href` on an interval** — rejected. Either polls too
  slowly (laggy detection) or too fast (wasted cycles on every page,
  running for the extension's entire lifetime on every matched tab).
  Event-driven detection has no such tradeoff.
- **`MutationObserver` on `document.title` or a stable DOM anchor** —
  rejected as the primary mechanism. Indirect (infers navigation from a
  side effect that could change for unrelated reasons) and specific to
  how Spotify's particular SPA happens to update the DOM, rather than
  observing navigation directly. Patching `history` methods is what
  actually changes on navigation, for any pushState-based router, not
  just Spotify's.
- **Detecting from `background/` via `chrome.tabs.onUpdated`** —
  rejected for this PR. `chrome.tabs.onUpdated` fires on full navigation
  (URL/tab changes Chrome itself tracks) but does not reliably fire on
  in-app `pushState` navigation within a single-page app, which is
  exactly the case that matters for Spotify. Would also require
  `host_permissions` this PR doesn't otherwise need.

## Consequences

- Adding a second provider (e.g. Apple Music) means one new file in
  `content/detectors/` plus one `registry.register(...)` call — the
  registry, the navigation watcher, and `content-script.ts`'s wiring
  don't change.
- `content-script.ts` currently only proves detection works via
  `console.log`; PR4 (UI injection) is what actually consumes a
  `DetectedResource` to render something, and is expected to be the PR
  that starts sending `CurrentResource` messages to `background/` — that
  wiring is deliberately deferred, not forgotten.
- `spa-navigation-watcher.ts`'s unsubscribe-function pattern is
  established now so PR4's injected UI (which has its own explicit
  cleanup requirements — "avoid duplicate injection," "clean itself up
  correctly") can reuse the same shape rather than inventing a second
  cleanup convention.
