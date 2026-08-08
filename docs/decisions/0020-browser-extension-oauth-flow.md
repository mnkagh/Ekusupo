# ADR-0020: Browser Extension OAuth Flow (PKCE, via `chrome.identity`)

Status: Accepted

## Context

ADR-0019 made `packages/providers/spotify` able to safely authenticate a
public client via PKCE, but generating the PKCE pair and running the
actual browser redirect was explicitly left to the extension. ADR-0012
similarly left `AuthenticateProvider` unimplemented — its payload
(`{ provider: string }`) didn't even have room for a token. Both gaps
close here, at the user's explicit direction to finish what ADR-0014
started.

## Decision

1. **`options/` runs the PKCE flow, not `background/` or `popup/`.**
   `chrome.identity.launchWebAuthFlow` needs a full extension page
   context; it's naturally where a "Connect Spotify" affordance belongs
   anyway (CLAUDE.md §8.2 lists this as a settings-surface concern), and
   it keeps `background/`'s job exactly what it already was — the only
   context holding a session and the only context exchanging a code for
   one.
2. **`options/pkce.ts`** — pure functions (`generateCodeVerifier`,
   `computeCodeChallenge`, `buildAuthorizeUrl`), no `chrome.*` dependency,
   directly unit-testable (Web Crypto is available in the Node/jsdom test
   environment already used elsewhere in this repo).
3. **`options/spotify-connect.ts`** — orchestrates the flow with every
   browser call injected (`launchWebAuthFlow`, `getRedirectURL`,
   `authenticate`), the same "untested glue, tested logic underneath"
   split `transfer-orchestrator.ts` and `content-script.ts` already use.
   Returns `false` rather than throwing for every failure mode (cancelled
   flow, denied access, failed exchange) — consistent with
   `@ekusupo/core`'s own "report, don't throw" convention.
4. **`AuthenticateProvider`'s payload grows** to carry `code`,
   `redirectUri`, `codeVerifier`, `clientId` — it was never implemented
   until now, so reshaping it (rather than preserving a shape nothing
   used) follows the same precedent as `GetTransferStatus` →
   `GetTabTransferState` in ADR-0015.
5. **`provider-registry.ts#getProvider` takes an optional `ProviderConfig`**
   (currently just `clientId`) so `background/` can construct a
   Spotify provider configured for the exchange without any other file
   needing to know Spotify specifically — the registry stays the one
   place a provider package is named (ADR-0012).
6. **The Client ID lives in `chrome.storage.local`**, not `.session`.
   Unlike `background/tab-transfer-status-store.ts`'s deliberately
   session-scoped job state (ADR-0015), a Client ID is stable config the
   user sets once and — being public by design (RFC 6749 §2.2, not a
   secret) — has no reason to be cleared on browser restart.
7. **A gap in the extension's context-boundary rules got closed while
   here**: `options/` never had a "no `@ekusupo/*` imports" ESLint rule
   like `content/`/`popup/` did (an oversight from earlier PRs, not a
   deliberate exception). `extensionOptionsStaysThin` now enforces it —
   this PR's own code satisfies it without any changes needed, which
   confirms the design was already correctly scoped.
8. **New permissions**: `"identity"` (the flow itself) and
   `host_permissions` for `https://accounts.spotify.com/*` (the token
   exchange target — present in `packages/providers/spotify/src/auth.ts`
   since v0.1 but never actually reachable from the extension until now,
   since nothing called it).

## Consequences

- A user who registers their own Spotify Developer app and pastes the
  Client ID into Options can now complete a real login — `background/`
  holds a real `AuthSession`, and `UserClickedTransfer` (ADR-0012) stops
  failing with "spotify isn't connected yet."
- Still not obtained by anything in this change: the Client ID itself.
  That remains the user's own action (ADR-0014's open question) — this
  ADR only makes the extension _capable_ of using one once supplied.
- 24 new tests (`pkce.test.ts`, `client-id-store.test.ts`,
  `spotify-connect.test.ts`, `Options.test.tsx`) cover every branch of
  the flow — including cancellation and denial — without ever calling a
  real Spotify endpoint or opening a real browser window.

## Alternatives Considered

- **Run the PKCE flow from `background/` directly.**
  `chrome.identity.launchWebAuthFlow` works from a service worker in
  principle, but `options/` is where the user-facing "connect your
  account" affordance has to live anyway (there's no UI in
  `background/`), so splitting the flow across two contexts for no
  reason was rejected in favor of keeping it together where it's
  triggered.
- **Store the Client ID in `background/`'s in-memory `SessionStore`**
  instead of a dedicated `chrome.storage.local` entry. Rejected — a
  service worker can be terminated and restarted (the exact problem
  ADR-0015 solved for transfer status); a Client ID the user typed in
  shouldn't have to be re-entered every time that happens.
