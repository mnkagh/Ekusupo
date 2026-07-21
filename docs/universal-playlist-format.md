# Universal Playlist Format (UPF) v0.1

## Purpose

UPF is Ekusupo's provider-neutral, canonical representation of playlist and
track metadata (CLAUDE.md §5.1). It exists so providers never need direct
pairwise conversions — every transfer goes `Provider → UPF → Provider`
instead of `Provider A → Provider B` for every pair.

This document is the schema. `packages/upf` is its TypeScript
implementation and must stay in sync with it (CLAUDE.md §18.4).

## Scope of v0.1

**v0.1 is playlists-only.** A `UpfDocument` holds `playlists: Playlist[]`
and nothing else. Standalone library collections (saved/liked tracks, saved
albums) are explicitly deferred — see "Deferred / Out of Scope" below.

## Design goals (from CLAUDE.md §5.2)

UPF must be provider-neutral, versioned, human-readable where practical,
machine-validated (schema defined here; a JSON Schema/validator is future
work — see Open Questions), extensible, backward compatible where possible,
and capable of preserving provider-specific metadata without requiring it.

A consequence of "human-readable" and "suitable for debugging": v0.1 is
**denormalized**. Entities are embedded inline (a playlist item embeds its
full track, a track embeds its full album and artists) rather than stored
once and referenced by id. This trades some duplication for a document
that's readable and diffable on its own, without a separate lookup table.
See ADR-0003 for the alternative considered.

## Envelope

```json
{
  "format": "upf",
  "version": "0.1.0",
  "createdAt": "2026-07-22T00:00:00.000Z",
  "source": {
    "provider": "example-provider",
    "exportedBy": "ekusupo-cli",
    "exportedByVersion": "0.1.0"
  },
  "playlists": []
}
```

| Field       | Type         | Required | Notes                                                                 |
| ----------- | ------------ | -------- | --------------------------------------------------------------------- |
| `format`    | `"upf"`      | yes      | Literal format tag.                                                   |
| `version`   | `string`     | yes      | Semver string for the UPF schema version, e.g. `"0.1.0"`.             |
| `createdAt` | `string`     | yes      | ISO 8601 timestamp of when this document was produced.                |
| `source`    | `UpfSource`  | no       | Where this document came from. Omitted for hand-authored/merged docs. |
| `playlists` | `Playlist[]` | yes      | May be empty.                                                         |

`UpfSource` fields (`provider`, `exportedBy`, `exportedByVersion`) are all
optional free-form strings — `provider` is a runtime slug (e.g.
`"spotify"`), never a closed type-level union. See "Provider-agnosticism"
below.

## Entities

### Playlist

| Field          | Type              | Required | Notes                                              |
| -------------- | ----------------- | -------- | -------------------------------------------------- |
| `id`           | `string`          | yes      | UPF-internal identity — see "Identity" below.      |
| `title`        | `string`          | yes      |                                                    |
| `description`  | `string`          | no       |                                                    |
| `items`        | `PlaylistItem[]`  | yes      | Array order **is** track order. May be empty.      |
| `artwork`      | `Artwork`         | no       |                                                    |
| `privacy`      | `PlaylistPrivacy` | no       | `"public" \| "private" \| "unlisted" \| "unknown"` |
| `providerRefs` | `ProviderRefs`    | no       |                                                    |
| `createdAt`    | `string`          | no       | ISO 8601. Not every provider exposes this.         |
| `updatedAt`    | `string`          | no       | ISO 8601.                                          |

### PlaylistItem

A thin wrapper, not a bare `Track[]`, so per-item metadata (when it was
added, by whom) has somewhere to live without polluting `Track` itself —
the same track can appear in many playlists with different `addedAt`
values.

| Field     | Type     | Required | Notes                                                                                                                               |
| --------- | -------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `track`   | `Track`  | yes      | Embedded, not referenced.                                                                                                           |
| `addedAt` | `string` | no       | ISO 8601.                                                                                                                           |
| `addedBy` | `string` | no       | Opaque identifier (e.g. a provider-scoped user id) — **not** a full `User` domain object; that belongs to `packages/core`, not UPF. |

### Track

| Field          | Type                   | Required | Notes                                                                            |
| -------------- | ---------------------- | -------- | -------------------------------------------------------------------------------- |
| `id`           | `string`               | yes      |                                                                                  |
| `title`        | `string`               | yes      |                                                                                  |
| `artists`      | `Artist[]`             | yes      | Ordered; first entry is the primary artist (see "Artists").                      |
| `album`        | `Album`                | no       | Some tracks aren't grouped under an album (e.g. singles from certain providers). |
| `durationMs`   | `number`               | no       | Integer milliseconds (see "Duration").                                           |
| `explicit`     | `ExplicitContentState` | no       | `"explicit" \| "clean" \| "unknown"` (see "Explicit content").                   |
| `externalIds`  | `ExternalIds`          | no       | Typically `isrc`.                                                                |
| `providerRefs` | `ProviderRefs`         | no       |                                                                                  |
| `trackNumber`  | `number`               | no       | Position within its album, if known.                                             |
| `discNumber`   | `number`               | no       |                                                                                  |

### Album

| Field          | Type           | Required | Notes                                                                              |
| -------------- | -------------- | -------- | ---------------------------------------------------------------------------------- |
| `id`           | `string`       | yes      |                                                                                    |
| `title`        | `string`       | yes      |                                                                                    |
| `artists`      | `Artist[]`     | yes      | Ordered; supports various-artists releases.                                        |
| `releaseDate`  | `string`       | no       | ISO 8601 date; precision varies by provider (year-only, year-month, or full date). |
| `externalIds`  | `ExternalIds`  | no       | Typically `upc` or `ean`.                                                          |
| `providerRefs` | `ProviderRefs` | no       |                                                                                    |
| `artwork`      | `Artwork`      | no       |                                                                                    |
| `totalTracks`  | `number`       | no       |                                                                                    |

### Artist

| Field          | Type           | Required | Notes                                                                              |
| -------------- | -------------- | -------- | ---------------------------------------------------------------------------------- |
| `id`           | `string`       | yes      |                                                                                    |
| `name`         | `string`       | yes      |                                                                                    |
| `providerRefs` | `ProviderRefs` | no       | No `externalIds` on `Artist` — ISRC/UPC identify recordings/releases, not artists. |
| `images`       | `Artwork`      | no       |                                                                                    |

### Artwork

```ts
type ArtworkImage = { url: string; width?: number; height?: number };
type Artwork = ArtworkImage[];
```

An array (not a single image) to hold multiple resolutions when a provider
exposes them. Used by `Playlist`, `Album`, and `Artist`.

### ExternalIds

```ts
interface ExternalIds {
  isrc?: string; // International Standard Recording Code — identifies a specific recording (Track)
  upc?: string; // Universal Product Code — identifies a release (Album)
  ean?: string; // European Article Number — alternative release identifier (Album)
}
```

These identify the real-world recording/release itself, independent of any
provider or of UPF's own `id`.

### ProviderRef / ProviderRefs

```ts
interface ProviderRef {
  id: string; // this entity's id on that provider
  url?: string; // a canonical/shareable URL on that provider, if any
  raw?: Record<string, unknown>; // provider-specific fields not otherwise modeled — isolated, never required (§5.5)
}

type ProviderRefs = Record<string, ProviderRef>;
```

`ProviderRefs` is keyed by an arbitrary **runtime** string slug (e.g.
`"spotify"`, `"apple-music"`, `"youtube-music"`) chosen by whichever
connector populates it. The key is typed as `string`, never as a closed
union of known providers — see "Provider-agnosticism."

## Identity

Every core entity (`Track`, `Album`, `Artist`, `Playlist`) carries a
required `id: string` that is UPF's own identity for that entity —
distinct from `externalIds` (identifies the real-world recording/release)
and `providerRefs[*].id` (identifies the entity on one specific provider).
This gives UPF an identity namespace that doesn't depend on any provider
having assigned an id yet.

**Open question**: this document does not prescribe how an `id` is
generated (random UUID vs. a deterministic hash of identifying fields).
That's an implementation decision for whatever produces a `UpfDocument`
(a connector, the transfer engine, or a hand-authored file), not part of
the data model. See "Open Questions."

## Explicit content

`Track.explicit` is a tri-state — `"explicit" | "clean" | "unknown"` — not
a boolean. Many providers simply don't disclose this per track; collapsing
that into `false` would assert something UPF doesn't actually know.

## Duration

`Track.durationMs` is an integer number of milliseconds. Chosen as the
single canonical unit (over seconds) both because it matches the most
common provider convention and because it gives enough precision for
duration-tolerance matching later (CLAUDE.md §10.2).

## Artists and featuring

`Track.artists` and `Album.artists` are ordered arrays, not a single
`artist` field plus a separate "featuring" list. The first entry is the
primary artist; any additional entries are featured/co-credited artists.
This models featured-artist credits (§10.2) and various-artists album
credits with one mechanism instead of two.

## Provider-agnosticism

CLAUDE.md §3.1/§3.2 forbid provider-specific concepts in the core, and
§5.5 requires provider extensions to be isolated and never required. UPF
v0.1 satisfies this **structurally**, not just by convention: the only
places a provider's identity ever appears are as a runtime string value —
a key in a `ProviderRefs` map, or the `source.provider` string. No type in
`packages/upf` names Spotify, Apple Music, YouTube, or any other provider.
A grep for those names across `packages/upf/src` must return nothing.

## Versioning

Every `UpfDocument` carries `format: "upf"` and a semver `version`. Within
`0.x`, breaking changes to this schema may still happen but must be
documented in this file's changelog (added once the first breaking change
occurs) and reflected in a new ADR. `1.0.0` will be the first version this
project commits to keeping backward compatible per CLAUDE.md §22.2.

## Deferred / Out of Scope for v0.1

Explicitly not modeled yet, to avoid designing blind before the phases
that actually need them exist:

- **Match confidence / match history / match reasoning** — CLAUDE.md §5.3
  lists these as things UPF should eventually represent, but they're
  Matching Engine _output_, not portable-format input. These belong in a
  later UPF version once the Matching Engine (CLAUDE.md §10) is designed.
- **Playlist folders/groups** (§2.1) — not universal across providers;
  deferred until a provider that supports them is actually being built.
- **Region availability notes, unavailable-item reasons** (§5.3) — these
  describe a transfer _outcome_, not the source data itself; likely belong
  on a future `TransferReport` type in `packages/core`, not on `Track`.
- **Standalone library collections** (saved/liked tracks, saved albums) —
  deferred to a v0.2 envelope addition (see "Scope of v0.1" above).

## Open Questions

1. **ID generation algorithm** — random UUID vs. deterministic
   content-hash. Deterministic hashing would let two independent exports of
   "the same" track produce the same `id`, which is attractive for
   diffing/dedup, but needs its own design pass (what fields feed the hash?
   how does it interact with `externalIds`?). Deferred until something
   actually needs to generate ids — likely the Connector SDK or transfer
   engine phase.
2. **When to add library collections** — revisit once the first connector
   or the transfer engine needs to move saved/liked tracks, at which point
   the real shape needed will be clearer than it is speculatively today.
