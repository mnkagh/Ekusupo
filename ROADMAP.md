# Ekusupo Roadmap

This file tracks release milestones, not just feature streams. See
`docs/vision.md` for the product vision and `CLAUDE.md` for the
engineering principles that constrain every milestone below.

Status legend: ✅ done · 🔶 in progress · ⬜ planned

## v0.1.0-alpha — Platform core proves itself

The engine works, independent of client or provider count. This is the
milestone CLAUDE.md §22.1 means by "first prove UPF, Connector SDK,
transfer engine, matching engine, reports."

- ✅ Documentation foundation (`docs/vision.md`, `CLAUDE.md`, ADR process)
- ✅ Universal Playlist Format v0.1 (ADR-0003)
- ✅ Connector SDK v0.1 (ADR-0004) + Provider Manifest (ADR-0005)
- ✅ Spotify reference provider (read-only)
- ✅ Matching Engine v0.1 (ADR-0006)
- ✅ Transfer Engine v0.1 (ADR-0006), split into explicit Dry Run / Live
  Transfer execution modes (ADR-0011)

## v0.2.0-alpha — First client wired end-to-end

The browser extension proves a real client can consume the platform
without duplicating business logic (CLAUDE.md §3.3, §7). **Complete.**

- ✅ Extension foundation, typed messaging (PR1–2)
- ✅ Resource detection (PR3)
- ✅ UI injection — floating action panel (PR4, ADR-0010)
- ✅ Transfer integration using Dry Run (PR5, ADR-0012)
- ✅ Progress UI, including popup status via `chrome.storage.session`
  (PR6, ADR-0013, ADR-0015)
- ✅ Real `AuthenticateProvider` (OAuth) — a real PKCE login flow via
  `chrome.identity.launchWebAuthFlow`, paste-your-own-Client-ID in
  Options (PR7, ADR-0014, ADR-0019, ADR-0020). The one thing still
  outstanding isn't code: registering an actual Spotify Developer app for
  a Client ID is the user's own action — nothing here can do that step.

## v0.3.0-alpha — Cross-provider transfer proven

Live Transfer validated against a real second provider, and the web app
becomes the primary dashboard (CLAUDE.md §8).

- ✅ Second provider connector — `@ekusupo/provider-upf-file` (ADR-0016),
  a local UPF file connector. Every commercial streaming provider (Apple
  Music, YouTube Music, Deezer, TIDAL) needs its own registered developer
  credentials, the same blocker as Spotify's OAuth — a file connector
  needed none of that, and is already a documented connector category
  (CLAUDE.md §6.2, §2.3), not a workaround.
- ✅ Cross-provider **Dry Run** proven — `runDryRunTransfer` with
  `@ekusupo/provider-spotify` and `@ekusupo/provider-upf-file`, two real,
  independently-implemented connectors, not `packages/core`'s own
  in-test fakes (`tests/integration/`).
- ✅ Cross-provider **Live Transfer**, write-through case — `runLiveTransfer`
  now writes source tracks through directly when the destination can't
  search (ADR-0018, superseding ADR-0016's original conclusion). Spotify
  → `@ekusupo/provider-upf-file` proven for real, tracks landing in an
  actual UPF file on disk (`tests/integration/`), not just fakes.
- ⬜ Cross-provider Live Transfer, **match-based case** (streaming ↔
  streaming) — still needs a second real **catalog** provider, blocked on
  the same external-credential problem as Spotify's own OAuth (ADR-0012,
  ADR-0014).
- 🔶 Web Dashboard MVP (CLAUDE.md §8.2 screens). Progress so far:
  - ✅ Tech stack decided (ADR-0017) and scaffolding done (ADR-0021):
    `apps/web`/`services/api` install, build, and run for real.
  - ✅ Auth v1 (ADR-0022) — real sign-up/sign-in/sign-out/me on
    `services/api`, session cookies, `node:crypto` password hashing,
    verified end-to-end against an actual running server (`curl`, not
    just `.inject()`). In-memory stores for now — no live Postgres exists
    in this environment to build a real one against yet.
  - ⬜ `apps/web`'s sign-in/sign-up UI — next step, nothing calls the
    auth API yet.
  - ⬜ Postgres-backed `UserStore`/`SessionStore`, connected provider
    accounts, transfer setup screens, history — the rest of CLAUDE.md
    §8.2, sequenced after the UI can at least sign someone in.

## Later (post-MVP)

Not sequenced yet — see `docs/vision.md`'s "Future Vision" and
CLAUDE.md §2.3 for the full list. Highlights: Sync Engine, **Backup
Engine** (the natural home for what a file/export connector like
`@ekusupo/provider-upf-file` is actually for — see ADR-0016), AI-assisted
matching (Phase 7), Desktop app, Telegram companion.

## Notes on this roadmap

- Milestones are named as alpha releases, not just feature branches, so
  progress is reviewable and tag-able (`v0.1.0-alpha`, etc.) rather than
  only visible as merged PRs.
- "Second provider done" and "Live Transfer proven" were tracked as
  separate line items on purpose (ADR-0016) — the first didn't
  automatically deliver the second. ADR-0018 later closed that gap for
  the write-through case specifically; the match-based case remains its
  own separate, still-open line item for the same reason.
- "OAuth implemented" and "OAuth usable" are similarly separate on
  purpose. PR7 makes the extension capable of a real login the moment a
  Client ID exists; it doesn't and can't create that Client ID itself
  (ADR-0014) — that's an external action, not a code gap.
- This file should be updated whenever a milestone's scope changes —
  outdated roadmaps are worse than missing ones (CLAUDE.md §18.4).
