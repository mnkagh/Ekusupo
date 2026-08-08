# ADR-0019: Spotify Provider PKCE Support

Status: Accepted — implements ADR-0014's Option A, at the user's direction.

## Context

ADR-0014 found that `packages/providers/spotify/src/auth.ts` only
implemented the classic Authorization Code flow — Basic auth with a
`clientId:clientSecret` pair. That's correct for a confidential client
(something that can keep a secret, like a backend server) and wrong for
a browser extension: extension code ships to every user's machine and
can be unpacked, so any embedded `clientSecret` isn't actually secret
(CLAUDE.md §12.1, §12.3). ADR-0014 proposed three options and left the
decision open pending the user's input. The user reviewed it and
directed Option A — add PKCE support — to be implemented.

## Decision

1. **`exchangeToken` branches on whether `config.clientSecret` is set.**
   Set → unchanged v0.1 behavior (Basic auth header, no `client_id` in
   the body). Absent → no `Authorization` header at all; `client_id`
   goes in the request body instead (RFC 7636's public-client shape).
2. **`authenticate()` requires a `codeVerifier` in `AuthInput.raw` only
   when `clientSecret` is absent.** The confidential-client path is
   completely unaffected — same required fields (`code`, `redirectUri`),
   same request shape, same tests passing unmodified.
3. **No `connector-sdk` change.** `AuthInput.raw` was already an opaque
   `Record<string, unknown>` the SDK never parses (`packages/connector-sdk/src/auth.ts`'s
   own doc comment: "The SDK never parses or generates a token") — adding
   a `codeVerifier` field is exactly what that design already anticipated.
4. **Generating the PKCE pair and running the redirect stays out of
   scope for this package**, same boundary as the original `code`
   exchange already had. `apps/extension` does that part — see ADR-0020.

## Consequences

- `packages/providers/spotify` can now be safely authenticated from a
  public client. This alone doesn't unblock a live demo — a registered
  Spotify Developer app (Client ID) is still required, and that's an
  external credential the user needs to obtain themselves (ADR-0014's
  "Question for the user" still stands on that specific point).
- New `auth.test.ts` proves both request shapes directly (headers, body
  fields) without a live network call — the same fake-fetch style already
  used throughout this package.
- All pre-existing tests (confidential-client path, via
  `provider.test.ts`'s auth-lifecycle test) pass unmodified.

## Alternatives Considered

Already covered in ADR-0014 — no new alternatives surfaced during
implementation. This ADR exists to record that Option A was the one
actually built, and exactly how.
