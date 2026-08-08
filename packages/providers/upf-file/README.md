# @ekusupo/provider-upf-file

**Ekusupo's second connector, and the first that isn't a streaming
service.** Reads and writes a single UPF JSON file as a small
multi-playlist library — CLAUDE.md §6.2's "export format connector" /
"backup connector" category, using `packages/upf` directly (see
`docs/universal-playlist-format.md`).

## Why a file, not a second streaming service

Every commercial streaming API (Apple Music, YouTube Music, Deezer,
TIDAL) needs its own registered developer credentials before any code
against it can run for real — the same external-credential blocker
`packages/providers/spotify`'s OAuth already hit (see
`docs/decisions/0012-browser-extension-transfer-integration.md`). A file
connector needs none of that, and it's already a documented connector
category, not a workaround invented to dodge the problem.

## What's implemented

- `upfFileManifest` — static provider metadata.
- `createUpfFileProvider({ filePath })` — a factory implementing
  `MusicProvider`'s `manifest`, `getCapabilities`, `authenticate`,
  `refreshAuthentication`, `revokeAuthentication`, `listPlaylists`,
  `getPlaylist`, `createPlaylist`, `addTracksToPlaylist`. A missing file
  reads as an empty library, not an error — the natural starting state
  for a backup target.

## What's deliberately NOT implemented, and why

**No `searchTracks` — the important part.** A UPF file has no catalog to
search; there's nothing to return candidates from. This isn't a
missing feature, it's honest capability reporting (CLAUDE.md §3.4).

The consequence: **this provider cannot be a `runLiveTransfer` destination
today.** `runLiveTransfer` requires `tracks.search` up front (ADR-0006)
because its write step adds whatever the destination's own search
returned (`decision.candidate`, a destination-native track) — not the
source track directly. That's the right design for streaming-service ->
streaming-service transfer (find the equivalent track in the destination
catalog), but it doesn't fit a write-through export target, which just
wants to persist the source track as-is. See ADR-0016 for the full
reasoning — this is a scope boundary the architecture already implies
(CLAUDE.md's "Backup Engine" is a distinct, not-yet-built component from
the Transfer Engine), not a bug found in `runLiveTransfer`.

This provider works today as:

- A **Dry Run source or destination** (`runDryRunTransfer` never requires
  destination search — ADR-0011), including cross-provider Dry Run
  against a real second connector, not a fake in-test one.
- A **standalone read/write UPF library** — create a playlist, add
  tracks, read it back, hand the file to another process. This is the
  shape a future "Export UPF" feature (CLAUDE.md §8.2) would build on.

No `getProfile`, `updatePlaylist`, `deletePlaylist`,
`reorderPlaylistItems`, or `removeTracksFromPlaylist` — none of those
have an obvious meaning for a flat file yet, and CLAUDE.md §16.2 asks for
no abstraction without a specific need.

## No live network calls, no external credentials, anywhere

Every test uses a real temporary directory (`node:fs/promises` +
`node:os.tmpdir()`), not a mock — unlike `packages/providers/spotify`,
there's no external service to avoid hitting, so real (temp) disk I/O in
tests is simpler and just as safe.
