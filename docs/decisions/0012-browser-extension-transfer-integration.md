# ADR-0012: Browser Extension Transfer Integration (PR5)

Status: Accepted

## Context

PR4 left every button in the injected panel logging-only.
`docs/browser-extension.md` already commits PR5 to "wiring the background
worker to `@ekusupo/core`'s `runTransfer`, via `@ekusupo/providers/spotify`"
— that much was decided before this PR.

Two things changed since that line was written, both from ADR-0011:

1. The engine now has explicit `runDryRunTransfer` / `runLiveTransfer`
   functions instead of one `runTransfer` with a `dryRun` flag. The user's
   own instruction was to resume PR5 using Dry Run specifically.
2. Live Transfer needs a second real provider to be meaningful (CLAUDE.md
   §3.2 — no provider is special, so a same-provider "live transfer" would
   just overwrite the one connector's own data). Dry Run has no such
   requirement.

The bigger open question this PR actually had to resolve: `runDryRunTransfer`
needs an `AuthSession`. Nothing in this repository can produce a real one
yet. `packages/providers/spotify/src/auth.ts` requires an authorization
`code` from a redirect flow that's explicitly out of scope for that
package, plus a `clientId`/`clientSecret` pair — a real Spotify Developer
app registration. That's an external credential per the standing rule:
STOP and don't fabricate a workaround. `AuthenticateProvider`'s payload
(`{ provider: string }`, defined back in PR2) doesn't even carry a token,
which — in hindsight — is consistent with OAuth being intentionally
someone else's problem: CLAUDE.md §4.4 puts "Connect provider account" in
the API layer, and `services/api` doesn't exist yet.

## Decision

1. **Implement everything up to the credential boundary; stop exactly
   there, visibly.** `background/session-store.ts` is a real, typed,
   in-memory `Map<provider, AuthSession>` — the architecture piece the
   extension's own diagram already promised ("Background Service Worker
   — owns provider auth/session state") — but nothing populates it yet.
   `UserClickedTransfer`'s handler checks it and fails with a clear,
   user-legible reason ("spotify isn't connected yet…") rather than
   throwing or silently no-opping. This is real, tested behavior today,
   not a stub waiting on OAuth to become real.
2. **`background/transfer-orchestrator.ts` has no `chrome.*` dependency.**
   `runDryRunTransferForResource(resource, deps)` takes `getProvider`,
   `getSession`, and three outcome callbacks as plain injected functions —
   the same "untested glue, tested logic underneath" split PR3/PR4 already
   established for `content-script.ts`. It's directly unit-testable with
   the same fake-`MusicProvider` technique `packages/core`'s own tests use
   (`transfer-orchestrator.test.ts`), with no `chrome` faking needed.
3. **`background/provider-registry.ts` is the one place a provider
   package is named.** A `Record<string, () => MusicProvider>` map,
   currently one entry. This satisfies `docs/browser-extension.md`'s
   "Adding a future provider" promise as closely as a single real
   provider allows: the orchestrator and session store never see a
   provider name resolve to a package import, only the tiny registry
   does. Adding a second provider later is one map entry here, not a
   change to the orchestrator, the session store, or any test written
   against them.
4. **Source and destination are the same connected provider.** There's no
   destination-picker UI, and building one now would be speculative —
   nothing consumes it. `docs/transfer-engine.md` already documents
   same-provider Dry Run as valid scope for exactly this reason. Real
   cross-provider transfer is v0.3.0-alpha's job (`ROADMAP.md`), once a
   second connector exists to make the destination side meaningful.
5. **Outcomes are logged, not yet pushed to the UI.** `onProgress` /
   `onCompleted` / `onFailed` go to `console.log`/`console.warn` in this
   PR. Sending them to the tab as real `TransferProgress` /
   `TransferCompleted` / `TransferFailed` messages, and rendering them, is
   PR6 — keeping this PR's diff to "the engine actually runs," reviewable
   on its own, matching `docs/browser-extension.md`'s existing PR5/PR6
   split.
6. **`host_permissions: ["https://api.spotify.com/*"]` added to
   `manifest.json`.** The first PR whose code path actually performs a
   cross-origin `fetch` from the background service worker — CLAUDE.md
   §12.2 / the extension's own "request only what the current PR uses"
   rule means this couldn't be requested any earlier.

## Consequences

- A user can click Transfer today and get an honest, specific failure
  ("spotify isn't connected yet") logged in the service worker's console
  — real behavior, verifiable by loading the unpacked extension, not a
  simulated demo.
- A live, end-to-end Dry Run (real Spotify data flowing through) is
  blocked on a real `AuthenticateProvider` implementation, which is
  blocked on registering a Spotify OAuth app and deciding where the
  client secret lives (`services/api`, per CLAUDE.md §4.4) — both
  explicitly external-credential / architecture questions, not something
  to solve inside this PR. Tracked as the next real gap, not silently
  dropped.
- `apps/extension` now depends on `@ekusupo/core`, `@ekusupo/connector-sdk`,
  `@ekusupo/provider-spotify`, and `@ekusupo/upf` (the last only for test
  fixtures). `background/` remains the only extension context ESLint
  allows to import any of them.
- Every behavior added here is covered by `transfer-orchestrator.test.ts`
  without needing a live Spotify account, a browser, or `chrome.*` fakes.

## Alternatives Considered

- **Build a minimal manual-token-entry form in Options** so a real dry run
  could be demonstrated end-to-end without full OAuth. Rejected: the
  `AuthenticateProvider` message contract doesn't carry a token today (a
  deliberate PR2 decision), long-lived tokens pasted into extension
  storage is a security question CLAUDE.md §12 hasn't been asked to
  answer yet, and `services/api` is explicitly where "Connect provider
  account" is supposed to live (§4.4) — building a parallel path now
  would likely need to be thrown away once that exists.
- **Fabricate a fake/dev-only session so the extension always "works" in
  a demo.** Rejected outright — this would misrepresent what's actually
  connected, exactly the kind of hidden state CLAUDE.md §16.2 forbids
  ("Do not... silently ignore security concerns"); a fake credential path
  is worse than an honest failure message.
- **Skip the provider-registry indirection and call `createSpotifyProvider`
  directly in the orchestrator.** Rejected — it would make the
  orchestrator provider-name-aware for no real benefit today, and
  contradicts `docs/browser-extension.md`'s existing "background/ never
  imports a specific provider package by name" framing more than
  necessary. The registry keeps that promise true for every file except
  one three-line map.
