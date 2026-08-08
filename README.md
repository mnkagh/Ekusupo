# Ekusupo

Ekusupo is a universal music interoperability project for transferring, synchronizing, backing up, analyzing, and managing music libraries across supported platforms.

The goal is not to build a single-provider transfer tool. The goal is to build a provider-agnostic system where any supported source can connect to any supported destination through shared formats, common connector interfaces, and transparent matching logic.

```text
Any supported source
        |
        v
Ekusupo Core
        |
        v
Any supported destination
```

## What Ekusupo Is

Ekusupo is designed to help users work with:

- Playlists.
- Albums.
- Tracks.
- Liked or saved songs.
- Library collections.
- Playlist metadata.
- Playlist artwork where supported.
- Export formats such as UPF, JSON, CSV, and M3U.

The platform is designed around a shared core that can power:

- A browser extension.
- A web app.
- A future desktop app.
- Future companion bots and integrations.

## Core Ideas

### Provider-Agnostic Core

No provider is the center of the system.

Spotify, Apple Music, YouTube Music, Deezer, TIDAL, local libraries, self-hosted services, and future platforms should all be represented as connectors with declared capabilities.

### Universal Playlist Format

Universal Playlist Format, or UPF, is Ekusupo's portable representation for playlist and library metadata.

Instead of building one-off conversions between every pair of providers, Ekusupo converts provider data into a shared format and then maps it to the destination provider.

```text
Provider -> UPF -> Provider
```

### Connector SDK

Every provider integration should implement a common connector contract.

Connectors declare what they support, such as:

- Reading playlists.
- Creating playlists.
- Searching tracks.
- Reading albums.
- Saving tracks.
- Preserving artwork.
- Handling rate limits.

The transfer engine uses these capabilities instead of hardcoded provider assumptions.

### Intelligent Matching

Ekusupo should match music items using layered logic:

- Stable identifiers such as ISRC and UPC.
- Normalized title, artist, album, and duration.
- Explicit or clean version awareness.
- Regional availability.
- Confidence scores.
- AI-assisted reasoning for ambiguous cases.

AI should improve difficult decisions, not replace deterministic matching.

## MVP Direction

The first version should focus on proving the architecture.

Initial clients:

- Browser extension.
- Web app.

Initial platform components:

- Ekusupo Core.
- Universal Playlist Format.
- Connector SDK.
- Transfer engine.
- Matching engine.
- Provider capability matrix.
- Transfer reports.
- Basic transfer history.

Initial provider support should start small. The first two providers are implementation choices, not architectural centers.

## What Ekusupo Will Not Do

Ekusupo will not be built as:

- A copyrighted music downloader.
- A platform for bypassing provider restrictions.
- A scraper-first system when official APIs are available.
- A Spotify-first product.
- A set of hardcoded one-off provider conversions.

Ekusupo should respect provider terms, user privacy, OAuth scopes, rate limits, and copyright law.

## Repository Status

This repository is in the documentation and architecture foundation stage.

Before major implementation begins, the project should define:

- Product vision.
- Product requirements.
- System architecture.
- Connector SDK.
- Universal Playlist Format.
- Browser extension behavior.
- Web app behavior.
- Security model.
- Testing strategy.
- Roadmap.

The engineering constitution for this repository is [CLAUDE.md](./CLAUDE.md).

## Documentation

Start with:

- [Engineering Constitution](./CLAUDE.md)
- [Vision](./docs/vision.md)

Planned documentation:

- Product requirements.
- System architecture.
- Connector SDK specification.
- Universal Playlist Format specification.
- AI matching engine.
- Browser extension MVP.
- Web app MVP.
- Security model.
- Testing strategy.
- Roadmap.
- Architecture decision records.

## Development Philosophy

Ekusupo follows a documentation-first workflow:

```text
Idea
  |
Specification
  |
Architecture
  |
Implementation plan
  |
Implementation
  |
Tests
  |
Documentation update
  |
Review
```

The project values:

- Provider independence.
- User ownership.
- Clear architecture.
- Strong tests.
- Secure handling of user data.
- Transparent match decisions.
- Maintainable code.
- Respect for platform rules.

## Current Status and Next Steps

See `ROADMAP.md` for actively-maintained, milestone-by-milestone status
(what's done, what's in progress, and why anything not-yet-started is
blocked). This section intentionally isn't a second copy of that list —
two roadmaps drifting out of sync would be worse than one.

## License

License selection is pending.

Until a license is added, all rights are reserved by the repository owner.

