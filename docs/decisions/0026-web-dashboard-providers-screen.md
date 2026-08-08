# ADR-0026: Web Dashboard Connected Providers Screen

Status: Accepted

## Context

ADR-0025 built real provider-connection routes on `services/api`;
nothing called them from `apps/web`. This closes that gap, the same way
ADR-0023 closed it for auth.

## Decision

1. **`createProvidersClient(config)`** — the same factory shape as
   `createAuthClient` (ADR-0023): `listProviders()`,
   `disconnectProvider(provider)`, both real `fetch` calls with
   `credentials: "include"`.
2. **`getSpotifyConnectUrl()` returns a URL, not a function that calls
   it.** `/providers/spotify/connect` is a real server-side 302 to
   Spotify's own login page (ADR-0025) — `fetch()`-ing it from JS would
   just retrieve that redirect response/HTML instead of taking the user
   there. The UI uses a plain `<a href={...}>`, letting the browser do
   an actual navigation, not a click handler that calls the API client.
3. **`App.tsx` reads `?connected=spotify` / `?provider_error=...` once
   on mount** (the query string the callback route redirects back with —
   ADR-0025) and immediately strips it via
   `history.replaceState(null, "", pathname)`, so refreshing the page
   doesn't keep re-showing "Connected spotify." forever.
4. **No client-side routing added.** `ProvidersScreen` is just another
   piece of `App.tsx`'s signed-in view, not a route — there still isn't a
   second _navigable_ screen, only a second section on the one screen
   that exists.

## Consequences

- A user can now see whether Spotify is connected, click through to a
  real Spotify authorization page, land back with a real success/error
  message, and disconnect — the full loop, if they supply their own
  Spotify Client ID/Secret on `services/api` (ADR-0025's own open item;
  still not something this repository can do itself).
- Verified with a real `vite build`, not just `tsc`/tests — same bar
  every `apps/web` pass has held to since ADR-0021.

## What's still deferred

Unchanged from ADR-0023/ADR-0025: transfer setup, transfer history,
account settings, client-side routing (still only one real screen),
Postgres-backed stores swapped for a hosted instance.
