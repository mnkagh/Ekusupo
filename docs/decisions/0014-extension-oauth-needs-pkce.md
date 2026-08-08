# ADR-0014: Browser Extension OAuth Needs PKCE, Not the Current Client-Secret Flow

Status: Accepted — Option A implemented via ADR-0019 (backend PKCE
support) and ADR-0020 (extension-side login flow), at the user's
direction. The "Question for the user" below about registering a Spotify
Developer app is still open — nothing here required or obtained that
credential.

## Context

ADR-0012 deliberately stopped short of implementing `AuthenticateProvider`
because completing it requires an external credential (a registered
Spotify Developer app) that isn't something to fabricate or work around.
Looking closer at what a real implementation would need turned up a
second problem, underneath the credential one: **the existing auth flow
can't safely be called from the extension at all, regardless of who
supplies the credential.**

`packages/providers/spotify/src/auth.ts`'s `exchangeToken` always sends

```ts
Authorization: `Basic ${btoa(`${config.clientId ?? ""}:${config.clientSecret ?? ""}`)}`;
```

That's the classic Authorization Code flow, designed for a **confidential
client** — something that can keep a secret, like a backend server. A
browser extension is a **public client**: its code (background service
worker, `manifest.json`, everything) ships to every user's machine and can
be unpacked and read. Any `clientSecret` embedded there isn't a secret —
CLAUDE.md §12.1 ("Tokens must be... never exposed to frontend code beyond
what is strictly required") and §12.3 ("Secrets must not be committed")
both point at this same rule from different angles.

Spotify (and OAuth 2.0 generally, via RFC 7636) has an answer for exactly
this: **Authorization Code with PKCE**. No client secret — a
`code_verifier`/`code_challenge` pair generated per login attempt takes
its place. This is the correct flow for a browser extension. It's not
what `packages/providers/spotify` implements today.

This is the "implementation reveals a weakness in the SDK/connector"
situation the standing project rule covers: STOP, document, propose,
don't silently redesign.

## Decision

**None yet — this ADR is Proposed, not Accepted.** Documenting the
problem and options; implementation waits for a decision.

## Options

**A. Add a PKCE path to `packages/providers/spotify`, alongside the
existing flow.** `AuthInput` already has an opaque `raw: Record<string,
unknown>` the SDK doesn't interpret — a `codeVerifier` field fits there
without a connector-sdk change. `auth.ts` would branch: no `clientSecret`
configured → PKCE (`code_verifier` in the token request body, no
`Authorization` header); `clientSecret` configured → today's flow
unchanged, for whatever eventually calls this from `services/api` server-side.
Backward compatible — no existing test or caller changes behavior.

**B. Extension never does OAuth directly; it always redirects through a
future `services/api`.** Matches CLAUDE.md §4.4 ("Connect provider
account" is an API-layer operation) most literally. Defers all of this
until `services/api` exists — which per `ROADMAP.md` v0.3.0-alpha isn't
scheduled yet either, so this would leave PR5's "connect your account"
gap open for a while longer.

**C. Do nothing until directed.** The current state (honest "not
connected" failure — ADR-0012) isn't broken; it's just incomplete.

## Recommendation

**A**, but it doesn't fully unblock a live demo by itself. Even with PKCE
implemented, `chrome.identity.launchWebAuthFlow` (the standard MV3 way to
run the redirect) still needs a **Client ID** — registered by someone,
somewhere, on Spotify's own Developer Dashboard, accepting Spotify's
terms. That step can't be automated or skipped; it's the actual external
credential this project doesn't have. PKCE removes the _secret_
requirement, not the _registration_ requirement.

## Question for the user

Do you have (or want to create) a Spotify Developer account and register
an app for this project? If yes: send me the Client ID and the redirect
URI you registered (`https://<extension-id>.chromiumapp.org/` — Chrome
generates the exact value once the extension is loaded unpacked), and I
can implement Option A plus the `chrome.identity` login flow against it.
If no, or not yet: this stays Proposed and PR5's current honest-failure
behavior stands until it's revisited.

## Consequences if adopted

- `packages/providers/spotify`'s public `authenticate()` signature is
  unchanged; only its internal branching grows. Existing tests
  (client-secret path) keep passing unmodified.
- The extension would need a new `manifest.json` permission
  (`identity`) and an Options-page "Connect Spotify" affordance —
  scoped to a future PR, not implied by accepting this ADR alone.
- `AuthenticateProvider`'s payload (`{ provider: string }`) has no room
  for a `codeVerifier`/`code` today — PR2's contract would need a small,
  additive extension (one new optional field), consistent with ADR-0008's
  "one new entry, not a redesign."
