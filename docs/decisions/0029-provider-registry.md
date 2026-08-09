# ADR-0029: Provider registry and generic connect routes

Status: Accepted

## Context

Connecting a provider was written once, for Spotify, directly inside
`provider-routes.ts`: the CSRF check, the credential check, the token
exchange and the redirect handling all inline. Adding Apple Music and
YouTube Music meant either copying that file twice or generalising it.

Copies would have drifted. The CSRF check and the exchange/storage error
split are security-relevant, and three near-identical versions of them is
how one quietly loses a fix the other two received.

## Decision

**A registry describes each provider; the routes are generic.**
`provider-registry.ts` holds one `ProviderDefinition` per service —
scopes, authorize URL, code exchange, required environment variables —
and `connect-routes.ts` implements `/providers/:provider/connect` and
`/providers/:provider/callback` once for all of them. Everything
provider-specific lives in the registry; everything security-relevant
lives in the routes, once.

**Two auth kinds, because two are genuinely different.**

- `oauth2` — Spotify and YouTube Music. Redirect, callback, exchange.
- `serverToken` — Apple Music. Its catalogue is read with a developer
  token the operator signs out of band, so there is no user account to
  authorize and no provider page to visit. Connecting is a server-side
  capability check that stores the session directly.

Forcing Apple through an OAuth-shaped flow would have meant inventing a
redirect that goes nowhere.

**`GET /providers/catalog` reports what the server can actually do.**
Each entry carries `configured`, computed from the credentials the
server holds. The dashboard renders Connect controls from that rather
than from a hardcoded list — a client-side "available" flag was wrong
the moment an operator configured YouTube, and equally wrong when they
had not configured Spotify.

**Unconfigured providers name the variables they need.** The tile says
`Needs YOUTUBE_CLIENT_ID, …` rather than a bare "unavailable", because
the person seeing it is usually the person who can fix it.

**YouTube requests `youtube.readonly` only.** The Data API can create
playlists and this repo's connector implements that, but no route calls
it yet. Requesting write access the product cannot perform would breach
least privilege (CLAUDE.md §12.2); the scope widens when Live Transfer
ships, not before.

**Google's exchange sets `access_type=offline` and `prompt=consent`.**
Without both, Google issues a refresh token only on a user's very first
consent — a reconnect silently yields an access token that expires in an
hour with no way to renew it.

## Consequences

- Apple Music and YouTube Music are connectable, and the providers
  screen reflects the server's real capability rather than a guess.
- Adding a fourth provider is a registry entry, not a route.
- The Spotify-specific routes remain in place and still pass their
  tests. They are now redundant with the generic path and should be
  removed once nothing depends on them; deleting them in the same change
  that introduced the registry would have made a regression impossible
  to attribute.
- **Neither new provider has been verified against live servers.** Apple
  needs a paid developer account and a signed JWT; YouTube needs a
  Google Cloud OAuth client. Both are tested against injected fakes up
  to the network boundary, which is where this repository's ability to
  verify ends.

## Alternatives Considered

- **A route file per provider.** Rejected: three copies of the CSRF
  check is three chances to fix it in two places.
- **One route with `if (provider === "spotify")` branches.** Rejected —
  that is the provider-specific conditional CLAUDE.md §3.1 exists to
  prevent, moved from the core into the API layer.
- **Letting the client decide what is connectable.** Rejected: only the
  server knows which credentials it holds, so only the server can answer
  honestly.
