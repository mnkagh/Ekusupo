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

## What's deliberately NOT implemented

Every write operation (`createPlaylist`, `updatePlaylist`, `deletePlaylist`,
`addTracksToPlaylist`, `removeTracksFromPlaylist`, `reorderPlaylistItems`),
search, saved tracks/albums, sync, transfers, AI matching, and any browser
extension/UI code. Their methods simply don't exist on the object this
factory returns — absence is the capability signal (ADR-0004).

`authenticate()` expects an authorization `code` already obtained via a
redirect UI — building that UI is out of scope here. `revokeAuthentication`
is an intentional no-op: Spotify's Web API has no server-side token-revoke
endpoint.

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
