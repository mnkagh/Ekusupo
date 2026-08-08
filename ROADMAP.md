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
- 🔶 Merging `feature/transfer-engine-v1.1` into `develop` — open PR,
  pending review

## v0.2.0-alpha — First client wired end-to-end

The browser extension proves a real client can consume the platform
without duplicating business logic (CLAUDE.md §3.3, §7).

- ✅ Extension foundation, typed messaging (PR1–2)
- ✅ Resource detection (PR3)
- ✅ UI injection — floating action panel (PR4, ADR-0010)
- ⬜ Transfer integration using Dry Run (PR5) — blocked until
  `feature/browser-extension` merges the real Transfer/Matching Engine
  and ADR-0011's execution-mode split from `develop`
- ⬜ Progress UI (PR6)

## v0.3.0-alpha — Cross-provider transfer proven

Live Transfer validated against a real second provider, and the web app
becomes the primary dashboard (CLAUDE.md §8).

- ⬜ Second provider connector — deliberately not started yet; per
  CLAUDE.md §3.2 no provider is architecturally special, so the second
  connector's job is to validate cross-provider transfer, not to
  compensate for engine behavior the engine should already handle
  (see ADR-0011's "Alternatives Considered")
- ⬜ Web Dashboard MVP (CLAUDE.md §8.2 screens)
- ⬜ Live Transfer demonstrated source → destination across two real
  providers

## Later (post-MVP)

Not sequenced yet — see `docs/vision.md`'s "Future Vision" and
CLAUDE.md §2.3 for the full list. Highlights: Sync Engine, Backup Engine,
AI-assisted matching (Phase 7), Desktop app, Telegram companion.

## Notes on this roadmap

- Milestones are named as alpha releases, not just feature branches, so
  progress is reviewable and tag-able (`v0.1.0-alpha`, etc.) rather than
  only visible as merged PRs.
- Architectural phases are not skipped: v0.2.0-alpha's PR5/PR6 must land
  before v0.3.0-alpha's Web Dashboard work begins, per the project's
  standing sequencing decision.
- This file should be updated whenever a milestone's scope changes —
  outdated roadmaps are worse than missing ones (CLAUDE.md §18.4).
