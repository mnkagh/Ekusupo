# @ekusupo/provider-spotify

**A reference implementation, not a production-ready Spotify integration.**

Its purpose is to validate the architecture — `docs/universal-playlist-format.md`
and `docs/connector-sdk.md` — by proving that a real provider's data really
does convert cleanly into UPF, and that nothing about doing so requires
changing `packages/core`, `packages/connector-sdk`, or `packages/upf`.
Spotify was chosen because its Web API is mature and well-documented, not
because it's special (CLAUDE.md §3.2) — see `docs/decisions/0002-provider-package-boundaries.md`.

## What's implemented (read-only only)

- `spotifyManifest` — static provider metadata (`packages/connector-sdk`'s
  `ProviderManifest`), importable without constructing anything.
- `createSpotifyProvider(config)` — a factory (not a singleton) implementing
  `MusicProvider`'s `manifest`, `getCapabilities`, `authenticate`,
  `refreshAuthentication`, `revokeAuthentication`, `getProfile`,
  `listPlaylists`, `getPlaylist`.

`getPlaylist` **follows pagination to the end of the playlist**.
`GET /playlists/{id}` returns only the first 100 tracks and puts the rest
behind `tracks.next`; reading that one page — which this did until it was
caught — silently drops every track past the hundredth from a transfer
while the report still claims success. Bounded at 100 pages, and stops on
a page that returns nothing, so a paging bug on either side ends rather
than loops.

## What's deliberately NOT implemented

Every write operation (`createPlaylist`, `updatePlaylist`, `deletePlaylist`,
`addTracksToPlaylist`, `removeTracksFromPlaylist`, `reorderPlaylistItems`),
search, saved tracks/albums, sync, transfers, AI matching, and any browser
extension/UI code. Their methods simply don't exist on the object this
factory returns — absence is the capability signal (ADR-0004).

`authenticate()` expects an authorization `code` already obtained via a
redirect UI — building that UI is out of scope here (`apps/extension`'s
job, ADR-0019). `revokeAuthentication` is an intentional no-op: Spotify's
Web API has no server-side token-revoke endpoint.

## Two auth flows, picked by whether `clientSecret` is configured

- **`clientSecret` set** — confidential-client flow (Basic auth), for a
  future server-side caller (`services/api`) that can safely hold one.
  Unchanged from v0.1.
- **`clientSecret` absent** — Authorization Code **with PKCE** (RFC
  7636): no secret sent at all, `client_id` travels in the request body,
  and `authenticate()`'s `AuthInput.raw` must include a `codeVerifier`.
  This is the flow a browser extension must use — it's a public client
  and cannot safely hold a secret (ADR-0014, ADR-0019). Generating the
  `codeVerifier`/`code_challenge` pair and running the redirect itself is
  the caller's job (`chrome.identity.launchWebAuthFlow` in
  `apps/extension`); this package only knows how to exchange the
  resulting code, either way.

## No live network calls, anywhere

There are no Spotify developer credentials in this repository, and none
should ever be committed (CLAUDE.md §12.3). `createSpotifyProvider` takes
an injectable `fetchImpl`; tests (`provider.test.ts`) supply a mock
returning canned, schema-accurate JSON fixtures. `normalize.test.ts` tests
the Spotify-JSON-to-UPF conversion functions directly, with no HTTP
involved at all.

## Containment

Every Spotify-specific type (`types.ts`) and conversion function
(`normalize.ts`) is internal to this package — `index.ts` exports only
`spotifyManifest` and `createSpotifyProvider`/`SpotifyProviderConfig`.
Nothing outside this package needs to know Spotify's API shapes exist.
