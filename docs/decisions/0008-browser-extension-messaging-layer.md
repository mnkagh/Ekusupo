# ADR-0008: Browser Extension Messaging Layer

Status: Accepted

## Context

PR1 scaffolded the extension's four runtime contexts (popup, options,
background, content) with an empty `shared/` placeholder. Every remaining
Phase 5 PR (detection, UI injection, transfer integration, progress)
depends on how those contexts talk to each other, so that contract needs
to exist before any of them are implemented — the user's own framing:
"probably the most important browser-extension architecture decision."

## Decision

1. **One `MessageMap` interface** keyed by message type, each entry
   `{ payload; response }`, rather than a pair of named interfaces per
   message. `MessageType`, `ExtensionMessage<T>`, and `MessageResponse<T>`
   are derived from it generically. Adding a message in a later PR is one
   new entry, not two new types plus a manual pairing.
2. **No custom request-ID correlation.** `chrome.runtime.
sendMessage(message)` and `chrome.tabs.sendMessage(tabId, message)`
   already return a `Promise` scoped to that specific call in Manifest
   V3 — the browser already solves per-call correlation. Building a
   custom envelope with request IDs and a pending-request map would
   duplicate what the platform provides for free.
3. **Two sender helpers, not one, because the underlying Chrome APIs are
   genuinely asymmetric**: `sendToBackground` (popup/content →
   background, via `chrome.runtime.sendMessage`) and `sendToTab`
   (background → a specific tab's content script, via
   `chrome.tabs.sendMessage`). Both are received the same way, via
   `onMessage`, which wraps `chrome.runtime.onMessage.addListener`.
4. **Message payloads never reference `@ekusupo/*` types, including
   type-only imports.** Two independent reasons converge on the same
   answer: (a) `chrome.runtime`/`chrome.tabs` messages must be
   structured-cloneable — a `MusicProvider` instance or an `AuthSession`
   with live token state cannot cross this boundary regardless of typing,
   and (b) it keeps the wire protocol structurally decoupled from backend
   internals, matching how `upfStaysLeaf` and friends already block
   type-only imports too (ADR-0004), not just value imports. `shared/`
   defines its own small `TransferStatus`/`TransferReportSummary` types
   that mirror, but do not import, `@ekusupo/core`'s equivalents.
5. **Enforced via ESLint, not convention**: `content/`/`popup/` blocked
   from importing any `@ekusupo/*` package; `shared/` blocked from
   importing `@ekusupo/*` or reaching into a sibling context folder.
   `background/` is deliberately left unrestricted — it's the one context
   allowed to import `@ekusupo/core`/`connector-sdk`/`providers/*`,
   starting PR5.
6. **`MessageError`** (`shared/errors.ts`) follows `ConnectorError`'s
   exact shape (`packages/connector-sdk/src/error.ts`): a closed
   `MessageErrorCode` union and an `Error` subclass carrying `code` —
   consistent error-modeling style project-wide rather than a one-off for
   this package.

## Alternatives Considered

- **Custom request-ID correlation with a pending-request `Map`** —
  rejected; Chrome's own `sendMessage` promise already provides this per
  call. Would add real complexity (timeout handling, cleanup on tab
  close) to solve a problem that doesn't exist.
- **Reusing `@ekusupo/core`/`@ekusupo/connector-sdk` types directly in
  message payloads** — rejected. Beyond breaking structured-clone
  compatibility for anything holding live objects, it would let a
  backend-only type change silently ripple into the extension's wire
  protocol, which every installed extension version depends on staying
  stable independent of backend refactors.
- **A single `sendMessage` function overloaded for both directions** —
  rejected; `chrome.runtime.sendMessage` and `chrome.tabs.sendMessage`
  take different arguments (no `tabId` vs. required `tabId`). Modeling
  them as two functions is more honest than hiding the difference behind
  a runtime branch.
- **A third-party typed-messaging library** (e.g. `webext-bridge`) —
  rejected for the same reason ADR-0007 rejected a CRX-specific Vite
  plugin: the problem is small enough to solve directly, and a
  hand-rolled ~50-line bus is easier to reason about and debug than an
  external abstraction over the same Chrome APIs.

## Consequences

- PR3 onward implement real `onMessage` handlers against an already-fixed
  contract; the message shapes don't need to be renegotiated per PR.
- `background/` becomes the only context ESLint allows to eventually
  import backend packages — the "security boundary" the user asked to
  document is now a lint failure, not just a paragraph in a doc, the
  moment `content/` or `popup/` tries to import `@ekusupo/core` directly.
- `shared/`'s types are duplicated-but-decoupled from `@ekusupo/core`'s
  equivalents; keeping the two in sync when the Transfer Engine's report
  shape changes is a manual step, not automatic — an accepted cost for
  the isolation it buys.
