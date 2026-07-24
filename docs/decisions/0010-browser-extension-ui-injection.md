# ADR-0010: Browser Extension UI Injection

Status: Accepted

## Context

PR3 gave the content script a way to detect what page it's on; PR4 makes
that visible to the user. The brief requires the injected UI to survive
SPA navigation, avoid duplicate injection, clean itself up correctly, and
avoid interfering with Spotify's own interface, while depending only on
the detection system (not the messaging bus's business meaning, not the
Transfer Engine).

## Decision

1. **A single host element appended to `document.body`, with
   `attachShadow({ mode: "open" })`**, hosting a React root. Shadow DOM is
   the standard technique for content-script UI because style isolation
   is bidirectional: the host page's CSS cannot reach into the shadow
   tree, and `:host { all: initial; }` stops the shadow tree from
   inheriting anything (font, color, line-height) from wherever it landed
   in the host page's DOM.
2. **A fixed-position floating panel (`bottom: 16px; right: 16px; z-index:
2147483647`), not injection into a specific point in Spotify's own
   markup.** There's no way to inspect Spotify's live DOM from this
   environment to find a real, stable selector to inject next to (e.g.
   its "⋯" menu) — hardcoding one anyway would be exactly the kind of
   fragile, unverifiable, provider-specific guessing the rest of this
   architecture avoids. A fixed overlay has zero dependency on Spotify's
   internal structure and can't end up in a DOM node Spotify's own React
   tree later re-renders out from under it.
3. **`InjectionManager` (`content/injection-manager.ts`) owns DOM/React
   lifecycle only** — `show(resource, callbacks)`, `hide()`. It has no
   knowledge of `chrome.*` messaging. `show()` creates the host/shadow
   root exactly once (checked both via an instance field and a
   `document.getElementById` guard, defending against the content script
   somehow running twice) and re-renders on every subsequent call;
   `hide()` unmounts the React root and removes the host element
   entirely.
4. **`ActionPanel` (`content/ui/ActionPanel.tsx`) is presentational
   only** — `{ resource, onTransfer, onPreview, onCopyUpf }`, no
   messaging import, no business logic. `content-script.ts` is the one
   place that wires those callbacks to `sendToBackground` calls, the same
   "untested glue, tested logic underneath" split PR1/PR3 already
   established for that file.
5. **`MessageMap` gains `PreviewRequested` and `CopyUpfRequested`**,
   alongside PR2's `UserClickedTransfer` — one entry each, per ADR-0008's
   intended extension pattern. `background/service-worker.ts` registers
   stub handlers for all three (acknowledge + log) — this is the first
   time the full content → background round trip runs in the real
   extension, not just against a fake `chrome` in tests.

## Alternatives Considered

- **Injecting directly into Spotify's DOM (no Shadow DOM)** — rejected.
  No style isolation either direction; a global CSS rule on either side
  could break the other with no warning.
- **A `mode: "closed"` shadow root** — rejected; gains no real security
  benefit here (this isn't hiding anything sensitive) and makes the
  injected UI harder to inspect/debug and to reach from tests.
- **Inline injection next to Spotify's own controls** — rejected for now,
  not permanently; see decision 2. Worth revisiting once real selectors
  can be verified against the live site rather than guessed.
- **`ActionPanel` calling `sendToBackground` directly** — rejected; would
  make the component's tests need a fake `chrome` global for no benefit,
  and would blur "presentation" and "messaging" the same way CLAUDE.md
  §3.6 warns against blurring UI and business logic generally.

## Consequences

- `content.js`'s bundle size grows substantially (React/ReactDOM are now
  inlined into it) because `vite.content.config.ts` (ADR-0007) still
  correctly isolates the content script into its own self-contained
  build, which means it can no longer share the chunk `popup.js`/
  `options.js` use. Accepted for now; revisit only if bundle size becomes
  an actual problem, not preemptively.
- Adding Preview's and Copy UPF's real behavior later is additive
  (replace the background stub handlers), not a redesign of the
  messaging or injection layers.
- Because `InjectionManager` has no messaging knowledge, it can be
  reused as-is if a future provider's detector also needs the same panel
  — nothing about it is Spotify-specific.
