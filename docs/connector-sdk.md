# Connector SDK v0.1

This document is architecture and contracts only. For implementation-level
type definitions, read `packages/connector-sdk/src` directly — it's the
authoritative implementation of what's described here.

## What is the Connector SDK?

The Connector SDK is the contract between `packages/core` and every music
provider, self-hosted library, file format, or future integration
(CLAUDE.md §6.1). It is `packages/connector-sdk`: a package of TypeScript
interfaces and shared types — `MusicProvider` and its supporting types
(capabilities, authentication, pagination, errors). It contains no running
code that talks to a real provider.

## Why does it exist?

So that `packages/core` can orchestrate transfers, syncs, and backups
without ever knowing which specific provider it's talking to (CLAUDE.md
§3.1, §3.2). Core depends only on the `MusicProvider` interface; any object
implementing that interface can be plugged in.

## What problems does it solve?

- **Without it**, Core would need `if provider === "spotify"` branching
  everywhere it needs to read or write music data — exactly what CLAUDE.md
  §3.1 forbids.
- **Without it**, every provider would expose a different ad-hoc shape for
  "a playlist," forcing Core to understand N different data models instead
  of one (UPF).
- **Without it**, there'd be no single place to check "can this provider
  even do the thing I'm about to ask it to do" before attempting it —
  capability-driven design (CLAUDE.md §3.4) needs a declared, inspectable
  capability set.

## What responsibilities belong to the SDK?

- Defining the `MusicProvider` interface every provider package implements.
- Defining the capability model (`ProviderCapability`, `ProviderCapabilities`)
  used to declare what a given provider supports.
- Defining the authentication envelope (`AuthMethod`, `AuthInput`,
  `AuthSession`) — the _shape_ auth data travels in, not how auth is
  performed.
- Defining the pagination envelope (`PageRequest`, `Page<T>`).
- Defining the standardized error model (`ConnectorErrorCode`,
  `ConnectorError`).
- Defining the shared input types for write operations (`SearchQuery`,
  `CreatePlaylistInput`, `UpdatePlaylistInput`).

## What responsibilities explicitly do NOT belong to the SDK?

- **No provider-specific code.** No Spotify/Apple Music/YouTube Music (or
  any other provider) types, constants, or logic. That lives in
  `packages/providers/<name>` (CLAUDE.md §6.5, ADR-0002).
- **No HTTP clients, no OAuth flow implementation.** The SDK defines the
  _shape_ `AuthSession`/`AuthInput` travel in; actually exchanging an OAuth
  code for a token, or making an HTTP request to any provider API, is a
  provider package's job.
- **No transfer orchestration.** Deciding "read from provider A, match, write
  to provider B" is the Transfer Engine's job (CLAUDE.md §9), not the SDK's.
  A provider package must not orchestrate cross-provider transfers either
  (§6.5).
- **No matching logic.** Deciding whether two tracks from different
  providers are "the same song" is the Matching Engine's job (§10).
- **No persistence.** Storing tokens, transfer history, or anything else is
  infrastructure's job, accessed through abstractions Core defines — not
  something this package does or knows about.
- **No business logic of any kind.** This package is types and interfaces
  only, by design, at this stage.

## How should new providers integrate?

1. Create `packages/providers/<name>` (ADR-0002).
2. Implement `MusicProvider`, including a truthful `getCapabilities()` —
   only declare a `ProviderCapability` if the corresponding method is
   actually implemented.
3. Inside each implemented method, call the provider's real API, then
   normalize the response into UPF types (`@ekusupo/upf`) before returning
   — see "How are provider models converted to and from UPF?" below.
4. Map provider-native errors to `ConnectorError` with the closest-fitting
   `ConnectorErrorCode`.
5. The provider package may depend on: `@ekusupo/connector-sdk`,
   `@ekusupo/upf`, shared HTTP/error/rate-limit utilities. It must not
   depend on `@ekusupo/core` or any other provider package (ADR-0002).
6. (Future work, not this phase) Run the provider against a shared
   connector contract-test suite once one exists (CLAUDE.md §17.2).

## How does authentication work?

The SDK defines an envelope, not a flow:

- `AuthMethod`: `"oauth2" | "apiKey" | "none"` — `"none"` covers connectors
  that need no remote authentication at all (e.g. a future local-file
  connector).
- `AuthInput`: what Core hands a provider to start/complete authentication.
  Its `raw` field is opaque to the SDK — each provider defines what goes in
  it (an OAuth authorization code, an API key, etc.).
- `AuthSession`: what a provider hands back once authenticated. Also
  carries an opaque `raw` bag, plus an optional `expiresAt` — the one field
  the SDK _does_ understand, so Core can generically know "is this session
  possibly stale" without knowing the token format underneath.
- `MusicProvider.authenticate`, `.refreshAuthentication`, and
  `.revokeAuthentication` are the three required lifecycle methods every
  provider must implement (CLAUDE.md §12.1: tokens must be refreshable and
  revocable by the user).

Sessions are passed as an explicit parameter to every call
(`getPlaylist(session, id)`), not stored on the provider instance — see
ADR-0004 for why.

## How are capabilities exposed?

`MusicProvider.getCapabilities(): ProviderCapabilities` returns:

```ts
interface ProviderCapabilities {
  supports: ReadonlySet<ProviderCapability>;
  limits?: ProviderLimits; // maxBatchSize, requestsPerSecond, requestsPerDay
}
```

`ProviderCapability` is a closed union of capability strings (e.g.
`"playlists.create"`, `"tracks.searchByIsrc"`) — see
`packages/connector-sdk/src/capability.ts` for the full list. This is meant
to be inspected before calling anything, and to back the "provider
capability matrix" UI (CLAUDE.md §2.2).

## How should pagination be abstracted?

Cursor-based and opaque:

```ts
interface PageRequest {
  cursor?: string;
  limit?: number;
}
interface Page<T> {
  items: T[];
  nextCursor?: string;
}
```

The connector translates its provider's real pagination mechanism (offset,
page number, or native cursor) into this shape. Callers never need to know
which one a given provider actually uses.

## How should errors be standardized?

Every error a `MusicProvider` method throws should be a `ConnectorError`:

```ts
type ConnectorErrorCode =
  | "authentication_error"
  | "authorization_error"
  | "rate_limited"
  | "provider_unavailable"
  | "unsupported_capability"
  | "validation_error"
  | "not_found"
  | "unknown_error";
```

This is deliberately scoped to failures a _single connector call_ can have.
Cross-call outcomes like "partial transfer failure" or "match failure"
(CLAUDE.md §16.3) belong to the Transfer Engine's own error/report model,
not here — see ADR-0004.

## How should unsupported operations be represented?

Two layers, both required to agree:

1. **Declaratively**: `getCapabilities().supports` is the source of truth a
   caller checks _before_ calling an operation.
2. **Structurally**: every capability-gated method on `MusicProvider` is
   optional (`createPlaylist?(...)`). A provider that doesn't support an
   operation simply doesn't implement the method — it's `undefined`, and
   TypeScript won't let calling code invoke it without checking first.

`ConnectorError` with code `unsupported_capability` remains available as a
defensive fallback for a method that is implemented but must reject a
specific call it can't actually fulfill for some other reason.

## How are provider models converted to and from UPF?

Every `MusicProvider` method that returns provider data returns UPF types
(`Playlist`, `Track`, `Album`, `Artist` from `@ekusupo/upf`) directly —
never a provider-native shape. Concretely: `getPlaylist` returns
`Promise<Playlist>`, not some `Promise<SpotifyPlaylistResponse>`.

The conversion itself — turning "what the provider's API actually
returned" into a UPF `Playlist`/`Track`/etc. — happens _inside_ each
provider package's method implementations. It is not part of the SDK's
public contract, because doing so would require the SDK to know
provider-native shapes, which breaks provider-agnosticism (see ADR-0004,
decision 1, for the full reasoning — this is a deliberate deviation from
CLAUDE.md §6.4's illustrative `normalizeTrack`/`normalizePlaylist` methods).

Writes work the same way in reverse: `createPlaylist` takes UPF `Track[]`
in `CreatePlaylistInput`, and it's the provider package's job to translate
that into whatever shape its real API's create-playlist request needs.

## What is the provider lifecycle?

```text
instantiate (no auth yet)
        |
authenticate(input) -> AuthSession
        |
   [use session for read/write calls per getCapabilities()]
        |
   session nears/reaches expiresAt
        |
refreshAuthentication(session) -> new AuthSession
        |
   ... continues using the provider ...
        |
revokeAuthentication(session)   (user disconnects the provider, CLAUDE.md §21.2)
```

A provider instance itself is stateless with respect to any one user's
session — the same instance can run this lifecycle concurrently for
multiple `AuthSession`s (multiple connected accounts on the same provider).

## Deferred / Out of Scope for v0.1

- Write access to saved tracks/albums (only reads — `listSavedTracks`,
  `listSavedAlbums` — are modeled this version).
- Direct by-id `getAlbum`/`getArtist` lookups — only search is modeled;
  add if/when a real connector needs direct lookups.
- Region-availability metadata as a first-class type.
- A reusable connector contract-test suite (CLAUDE.md §17.2) — real value
  only once there's a first connector to test against it.
