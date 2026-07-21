# Ekusupo Vision

## Summary

Ekusupo is a universal music interoperability project.

Its purpose is to help users transfer, synchronize, back up, analyze, repair, and manage their music libraries across supported platforms through a provider-agnostic system.

Ekusupo should not be defined by any single provider. Spotify is not the core. Apple Music is not the core. YouTube Music is not the core. The core is the interoperability engine that allows supported providers, file formats, local libraries, and future integrations to communicate through a shared model.

## Mission

Build the most reliable provider-agnostic platform for moving, syncing, preserving, and understanding music libraries across supported services and formats.

## Vision Statement

Ekusupo should let users control their music library across platforms instead of being locked into one ecosystem.

The long-term vision is:

```text
Any supported music source
        |
        v
Ekusupo interoperability core
        |
        v
Any supported music destination
```

Users should be able to move from one supported music environment to another with clear expectations, transparent matching, useful reports, and minimal manual cleanup.

## Why Ekusupo Exists

Music libraries are personal. Users spend years building playlists, saving albums, liking songs, organizing collections, and discovering artists.

But music platforms often keep that library trapped inside one ecosystem.

When users switch providers or use multiple services, they face problems:

- Playlists do not transfer cleanly.
- Albums and liked songs may be hard to move.
- Some songs are unavailable in the destination service.
- Metadata may be lost.
- Wrong versions may be matched.
- Users may not understand why tracks failed.
- Large transfers can be slow or fragile.
- Existing tools often focus on basic playlist copying.

Ekusupo exists to make music libraries portable, explainable, and manageable across platforms.

## Product North Star

The product should answer this user need:

"I want my music library to work wherever I choose to listen."

That includes:

- Moving playlists between providers.
- Moving saved songs where supported.
- Moving albums where supported.
- Exporting a durable backup.
- Understanding what changed during a transfer.
- Fixing missing or mismatched tracks.
- Syncing libraries over time.
- Managing music across browser, web, desktop, and later companion clients.

## Core Beliefs

### Users Own Their Library

Users should be able to export, move, inspect, repair, and back up their music metadata.

Provider lock-in should not prevent users from managing their own playlists and library structure.

### Providers Are Connectors

No music provider should be hardcoded as the center of the system.

Every provider should connect through the same general architecture:

```text
Provider Connector
        |
        v
Connector SDK
        |
        v
Ekusupo Core
```

### Capabilities Matter

Different providers support different actions.

One provider may allow playlist creation but not artwork updates. Another may expose saved albums but not full listening history. Another may allow exports but not writes.

Ekusupo should model these differences explicitly instead of pretending every platform behaves the same.

### Transfer Quality Matters

A transfer is not successful just because a destination playlist was created.

A high-quality transfer should preserve:

- Correct tracks.
- Correct order.
- Correct playlist metadata where supported.
- Correct versions where possible.
- Clear explanations for skipped or changed items.
- Review options for uncertain matches.

### AI Should Assist, Not Hide Weakness

AI can make Ekusupo better by helping with:

- Ambiguous matches.
- Replacement suggestions.
- Metadata repair.
- Duplicate detection.
- Transfer summaries.
- Natural language workflows later.

But AI should not hide uncertainty. If the system is unsure, users should know.

### Preservation Is A Feature

Ekusupo should not only transfer data between active providers. It should also help users preserve their library metadata through durable exports.

Universal Playlist Format is central to this vision.

## Strategic Pillars

### 1. Universal Connectivity

Ekusupo should support a growing set of providers and formats through a connector architecture.

Potential connector categories:

- Streaming services.
- Self-hosted music servers.
- Local libraries.
- File formats.
- Backup targets.
- Sharing destinations.
- Companion integrations.

Examples may include:

- Spotify.
- Apple Music.
- YouTube Music.
- Deezer.
- TIDAL.
- Amazon Music.
- Plex.
- Jellyfin.
- Navidrome.
- Local files.
- CSV.
- JSON.
- M3U.
- UPF.

### 2. Intelligent Interoperability

Ekusupo should do more than copy names.

It should understand music metadata well enough to:

- Match the right recording.
- Avoid live, karaoke, cover, remix, or remaster mismatches when inappropriate.
- Prefer official versions.
- Use identifiers like ISRC where possible.
- Account for duration differences.
- Consider artist aliases and featured artists.
- Explain why a match was selected.

### 3. Transparent Reports

Users should never be left with only "5 songs failed."

Reports should explain:

- What succeeded.
- What failed.
- What was skipped.
- What was changed.
- What was uncertain.
- What can be retried.
- What requires manual review.

### 4. Shared Core Across Clients

The browser extension and web app should be different interfaces to the same Ekusupo system.

The browser extension should help users act directly from supported music websites.

The web app should be the main dashboard for connections, transfers, history, reports, and settings.

Future clients such as a desktop app or Telegram companion bot should reuse the same platform foundation.

### 5. Documentation-First Engineering

Ekusupo should be built from clear specifications rather than accidental code growth.

Important systems should be documented before implementation:

- UPF.
- Connector SDK.
- Transfer engine.
- Matching engine.
- Provider capability matrix.
- Browser extension behavior.
- Web app behavior.
- Security model.
- Testing strategy.

## MVP Vision

The MVP should prove that Ekusupo's architecture works.

It should not try to support every provider immediately.

The MVP should include:

- Browser extension.
- Web app.
- Ekusupo Core.
- UPF v0.1.
- Connector SDK v0.1.
- Transfer engine.
- Matching engine.
- Provider capability matrix.
- Transfer progress.
- Transfer report.
- Basic transfer history.
- First two provider connectors.

The first providers are proof points, not architectural centers.

## Future Vision

After the MVP, Ekusupo can expand into:

- More music providers.
- Desktop app for local libraries and power users.
- Scheduled sync.
- Playlist version history.
- Playlist diff and merge.
- AI playlist repair.
- AI playlist generation.
- Public developer API.
- Connector marketplace.
- Telegram companion bot.
- Discord or community sharing integrations.
- Self-hosted deployment options.

## Ethical Boundary

Ekusupo should help users manage metadata and provider-supported library actions.

It should not become a copyrighted music downloader or a tool for bypassing provider restrictions.

The project must respect:

- Provider terms.
- OAuth scopes.
- API rate limits.
- User privacy.
- Copyright law.

## Success Criteria

Ekusupo succeeds when users can:

- Connect supported providers safely.
- Move supported music data between providers.
- Understand provider limitations before starting.
- Get accurate matches with confidence scores.
- Review uncertain matches.
- Export durable backups.
- See clear reports.
- Trust that the system is acting with their permission.

Ekusupo succeeds technically when contributors can:

- Add a provider without rewriting the core.
- Add a client without duplicating business logic.
- Update UPF through documented versioning.
- Test connectors through shared contract tests.
- Understand the architecture from documentation.

## Long-Term Product Statement

Ekusupo should become the trusted interoperability layer for music libraries:

```text
Your music library.
Every supported platform.
One clear system.
```

