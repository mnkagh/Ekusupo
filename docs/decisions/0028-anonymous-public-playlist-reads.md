# ADR-0028: Public playlists without connecting an account

Status: Accepted

## Context

Until now `POST /transfers/dry-run` refused unless the caller had
completed the Spotify OAuth flow. That is the correct requirement for
someone's own library, but it is pure friction for a public playlist:
being asked to hand over your Spotify account before you can move a
playlist anyone can already open in a browser.

## Decision

**Two tiers of access, chosen automatically.**

1. **A connected account is used when present.** It can read the user's
   private playlists, liked songs, and library.
2. **Otherwise the server falls back to an app-level token** (OAuth2
   Client Credentials, `authenticateAsApp`). No user, no login — it
   reads public catalog data only.

The caller never picks. The route resolves the best available session,
and the response reports which was used via `usedConnectedAccount`.

**This does not make Spotify anonymous.** There is no unauthenticated
Spotify API, so the _server_ still needs a client ID and secret. What
disappears is the _end user's_ involvement. With no credentials
configured the route refuses and says so explicitly, rather than
pretending a public read might work.

**A failed anonymous read appends a `userActionsRequired` entry**
telling the user to connect their account. An app-level token cannot
distinguish "private" from "does not exist" — both are a 404 — so the
message must not assert a cause it cannot know. It states the action
that actually helps instead.

**The app token is cached** (`AppSessionCache`) until a minute before
expiry, with concurrent callers sharing one in-flight exchange. These
tokens last an hour and carry no user identity, so one serves every
anonymous read; fetching per request would burn rate limit for nothing.

**`createSpotifyAppSession` is standalone, not a `MusicProvider`
method.** That interface is provider-agnostic and must not grow a
concept only some providers have (CLAUDE.md §3.1). What it returns is an
ordinary `AuthSession`, so every provider-agnostic path downstream —
the Transfer Engine included — handles it unchanged.

## Consequences

- A user can transfer a public playlist with nothing connected. This is
  the first genuinely zero-setup path through the product.
- Client Credentials is a confidential-client grant, so `apps/extension`
  cannot use it (ADR-0019 — a browser extension can't hold a secret).
  Anonymous reads are a server-side capability only.
- **Spotify-owned editorial and algorithmic playlists are expected to
  fail** on this path. Spotify restricted those endpoints for
  app-credential access in late 2024, so `37i9dQZF1DX...` links will
  likely 404 while ordinary user-created public playlists succeed. This
  has not been verified against live Spotify from this environment —
  doing so needs credentials this repository does not have — so it is
  recorded as an expectation, not a tested fact.
- Writing to a destination still always requires a connected account.
  Nothing here changes that, and nothing should: no API permits writing
  into an account that has not authorized it.

## Alternatives Considered

- **Scraping the public playlist page.** Rejected outright: against
  Spotify's terms, fragile against markup changes, and explicitly
  disclaimed by CLAUDE.md §1.5 and §3.9.
- **Asking the user to paste a playlist's JSON.** Rejected as worse
  friction than connecting, for a worse result.
- **Making the client choose the tier explicitly.** Rejected: the
  server already knows what is available, and a client that picks wrong
  produces a confusing failure the user cannot act on.
- **Only supporting file import for the no-account case.** Still worth
  building (it needs no credentials from anyone), but it does not
  address the case the user actually has: a public playlist link.

## What's still deferred

A "paste a Spotify link" UI — this ADR covers the API path only, and
`apps/web` has no transfer screen yet. Extracting a playlist ID from a
full `open.spotify.com` URL also still belongs to whatever builds that
screen; the route takes a bare playlist ID today.
