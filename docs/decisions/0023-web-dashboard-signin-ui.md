# ADR-0023: Web Dashboard Sign-In UI

Status: Accepted

## Context

ADR-0022 built real auth on `services/api`; nothing called it. This
closes that gap: `apps/web` gets a sign-in/sign-up form and wires the
whole app's top-level state to whether a session exists.

## Decision

1. **`createAuthClient(config)` is a factory, not a bare set of
   functions** — the same shape as `createSpotifyProvider`/
   `createUpfFileProvider`, for one consistent "how do we talk to
   something external" pattern across this codebase. `authClient` (a
   module-level instance with no config) is what `App.tsx`/`SignInForm`
   actually use; tests construct their own with an injected `fetchImpl`.
2. **`fetch` is resolved inside `request()`, not captured once when the
   client is constructed.** This mattered in practice, not just in
   theory: the first version captured `config.fetchImpl ?? fetch` at
   `createAuthClient()`'s top level, which runs once at module import —
   before any test's `vi.stubGlobal("fetch", ...)` executes. Every test
   exercising the real `authClient` singleton (as opposed to a
   test-constructed client with an injected `fetchImpl`) silently made a
   real network call instead of hitting the stub, which surfaced as
   `ECONNREFUSED` failures once `App.test.tsx`/`SignInForm.test.tsx`
   started rendering components that use the singleton. Moving the
   `config.fetchImpl ?? fetch` lookup inside `request()` fixed it —
   resolved per call, so a global replacement made before a call happens
   is respected regardless of when the client object itself was built.
3. **`getMe()` resolves to `undefined` on a 401, rather than throwing.**
   "Not signed in" is an expected, normal state for this call
   specifically — every other non-2xx response still throws `ApiError`.
4. **One form, not two**, toggling between sign-in and sign-up — same
   fields, same submit handler, same error display. Splitting them would
   duplicate all of that for a difference of one API call.
5. **`App.tsx`'s state is a three-way union** (`loading | signed-out |
signed-in`), driven entirely by `getMe()` on mount — no client-side
   routing yet (there's exactly one screen's worth of content today), so
   this is a `useState` switch, not a router.
6. **Verified past `.inject()`/component tests**: a real `services/api`
   was started and hit with `curl` using an explicit `Origin:
http://localhost:5173` header (`apps/web`'s real Vite dev origin) to
   confirm the actual CORS preflight and response headers
   (`Access-Control-Allow-Origin`, `-Credentials`) are correct for a
   genuine cross-origin browser request — not just that `.inject()`
   (which bypasses CORS entirely) returns the right JSON. A real `vite`
   dev server was also started and confirmed to serve the app.

## Consequences

- A user can now actually sign up, sign in, see their email, and sign
  out, through the real UI talking to the real (in-memory-backed) API.
- The `fetch`-capture bug this ADR documents is exactly the kind of
  thing `pnpm audit`/static checks can't catch — found by writing
  component tests against the real singleton and watching them fail with
  a real network error instead of green-by-coincidence.
- Still no routing, no `packages/ui`, no screens past sign-in — all
  correctly out of scope per ADR-0021/ADR-0022's own deferrals, not
  newly discovered gaps.

## What's deferred

Unchanged from ADR-0022: Postgres-backed stores, password reset, email
verification, rate limiting. New from this pass: everything past
sign-in — connected providers, transfer setup, history (CLAUDE.md §8.2)
— and client-side routing, which the app doesn't need until there's a
second screen to route to.
