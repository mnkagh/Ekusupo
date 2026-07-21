# CLAUDE.md

This file is the engineering constitution for Ekusupo. Claude Code and any AI coding assistant working in this repository must read and follow this document before planning, editing, or generating code.

Ekusupo is a long-term open-source project, not a quick playlist-transfer script. Optimize for correctness, maintainability, portability, security, and clear documentation over speed.

## 1. Project Identity

### 1.1 Name

The project name is **Ekusupo**.

### 1.2 Mission

Ekusupo exists to help users transfer, synchronize, back up, analyze, repair, and manage their music libraries across supported platforms through a provider-agnostic interoperability layer.

### 1.3 Vision

Ekusupo should become a universal music interoperability platform where any supported source can connect to any supported destination through shared formats, common provider interfaces, transparent matching logic, and user-controlled workflows.

The long-term goal is:

```text
Any supported music source
        |
        v
Ekusupo interoperability core
        |
        v
Any supported music destination
```

### 1.4 What Ekusupo Is

Ekusupo is:

- A universal music interoperability platform.
- A provider-agnostic transfer and synchronization engine.
- A shared core used by a browser extension, web app, and later desktop and bot clients.
- A system for preserving music metadata where platform capabilities allow.
- A connector-based architecture for adding music providers over time.
- A user-owned library portability tool.
- A documentation-first engineering project.

### 1.5 What Ekusupo Is Not

Ekusupo is not:

- A Spotify-centered app.
- A one-off Spotify-to-YouTube converter.
- A copyrighted music downloader.
- A tool for bypassing platform access controls.
- A piracy tool.
- A scraper-first product when official APIs are available.
- A collection of tightly coupled provider hacks.
- A project where the browser extension, web app, and future desktop app duplicate business logic.

### 1.6 Core Product Promise

Users should be able to say:

"I want to move, sync, repair, analyze, or back up my music library from one supported platform to another, and I want Ekusupo to explain what happened clearly."

Ekusupo should then:

- Understand the source platform.
- Normalize the data into a universal internal representation.
- Match tracks, albums, artists, playlists, and library items intelligently.
- Respect the capabilities and limitations of the destination platform.
- Produce a clear transfer, sync, or backup result.
- Explain unmatched, changed, skipped, or repaired items.
- Let the user keep control.

## 2. Product Scope

### 2.1 Supported Content Types

Ekusupo should be designed to support the following content types where provider APIs and platform rules allow:

- Playlists.
- Playlist folders or groups.
- Saved tracks or liked songs.
- Albums.
- Artists.
- Individual tracks.
- Library collections.
- Playlist metadata.
- Playlist artwork.
- Playlist descriptions.
- Track order.
- Local library references.
- Exportable metadata files.

Not every provider will support every content type. The architecture must represent provider capability differences explicitly.

### 2.2 Initial MVP

The MVP should prove the core architecture, not maximize provider count.

MVP clients:

- Browser extension.
- Web app.

MVP platform components:

- Ekusupo Core.
- Universal Playlist Format, referred to as UPF.
- Connector SDK.
- Transfer engine.
- Matching engine.
- Provider capability matrix.
- Transfer reports.
- User authentication foundation.
- Provider account connection flow.
- Basic transfer history.

MVP providers:

- First provider connector.
- Second provider connector.

The exact first two providers may be chosen based on API feasibility, but the core must never treat either provider as special.

### 2.3 Later Scope

Later versions may include:

- Desktop app.
- Mobile apps.
- Telegram companion bot.
- Discord companion integration.
- Public developer API.
- Connector marketplace.
- Playlist version control.
- Playlist diff and merge.
- Scheduled sync.
- Collaborative playlists across providers.
- Local music library management.
- Plex, Jellyfin, Navidrome, and other self-hosted libraries.
- Advanced playlist analytics.
- AI playlist repair.
- AI playlist generation.
- Backup targets such as JSON, CSV, M3U, and UPF files.

Design for these possibilities, but do not implement them before the MVP foundation is stable.

## 3. Non-Negotiable Engineering Principles

### 3.1 Provider Agnostic Core

The Ekusupo core must not know provider-specific details.

The core must not contain logic like:

```text
if provider == "spotify"
if provider == "apple"
if provider == "youtube"
```

Provider-specific behavior belongs inside provider connectors. The core communicates with providers only through the Connector SDK interfaces and capability descriptors.

### 3.2 No Primary Provider

No provider is the center of the system.

Spotify is just a connector.
Apple Music is just a connector.
YouTube Music is just a connector.
Any future provider is just a connector.

The architecture must support:

```text
Provider A -> Ekusupo Core -> Provider B
Provider B -> Ekusupo Core -> Provider A
Provider C -> Ekusupo Core -> Export File
Local Library -> Ekusupo Core -> Provider A
```

### 3.3 Shared Core, Multiple Clients

The browser extension, web app, and later desktop app must share business logic through common packages and backend services.

Do not duplicate:

- Transfer logic.
- Provider matching rules.
- UPF parsing.
- Capability checking.
- Validation logic.
- AI matching orchestration.
- Error classification.
- Report generation.

Clients should be thin interaction layers. The core system should remain authoritative.

### 3.4 Capability-Driven Design

Every connector must declare what it can and cannot do.

The system must not assume every provider can:

- Read playlists.
- Create playlists.
- Update playlists.
- Delete playlists.
- Read liked songs.
- Create liked songs.
- Read albums.
- Save albums.
- Upload playlist artwork.
- Preserve descriptions.
- Preserve exact order.
- Search by ISRC.
- Search by title.
- Read regional availability.
- Provide explicit metadata.

The transfer engine must inspect capabilities before executing a workflow.

### 3.5 Documentation Before Code

No significant feature should be implemented without a written specification.

Before implementation, create or update relevant documentation:

- Product behavior.
- Architecture.
- Data model.
- API contract.
- Connector contract.
- Security concerns.
- Test strategy.
- Acceptance criteria.

Small maintenance changes may be documented in the pull request only, but product features and architectural changes need durable Markdown documentation.

### 3.6 Clear Boundaries

Each package, app, and service must have a clear purpose.

Avoid mixing:

- UI code with business logic.
- Provider connector code with transfer orchestration.
- AI matching with deterministic matching.
- Database persistence with provider API calls.
- Web app state with browser extension state.
- Authentication concerns with music matching concerns.

### 3.7 Deterministic First, AI Assisted

AI should improve the product but must not be the only reason basic transfers work.

Prefer deterministic matching when strong identifiers are available:

- ISRC.
- Provider track IDs.
- UPC.
- Exact duration.
- Artist IDs.
- Album IDs.
- Normalized titles.

Use AI for:

- Ambiguous matches.
- Replacement suggestions.
- User-facing explanations.
- Metadata repair suggestions.
- Duplicate detection assistance.
- Playlist analysis.

Do not use AI as a substitute for correct data modeling or well-designed algorithms.

### 3.8 User Ownership

Users own their music library metadata.

Ekusupo should make it easy to:

- Export metadata.
- Back up transfer state.
- Download reports.
- Understand what changed.
- Revoke provider connections.
- Delete stored account data.
- Avoid vendor lock-in.

### 3.9 Legal and Platform Respect

Ekusupo must respect:

- Provider terms of service.
- OAuth scopes.
- API rate limits.
- Copyright law.
- User privacy.
- Platform restrictions.

Do not implement features whose purpose is unauthorized downloading, DRM circumvention, credential theft, or bypassing provider access controls.

## 4. Architecture Overview

### 4.1 Conceptual Architecture

```text
                    Browser Extension
                           |
                           v
                        Web App
                           |
                           v
                    Ekusupo API Layer
                           |
                           v
                    Ekusupo Core Engine
                           |
        +------------------+------------------+
        |                  |                  |
        v                  v                  v
 Transfer Engine     Matching Engine     Sync Engine
        |                  |                  |
        +------------------+------------------+
                           |
                           v
                    Connector SDK
                           |
        +------------------+------------------+
        |                  |                  |
        v                  v                  v
 Provider Connector  Provider Connector  File Connector
```

### 4.2 Core Layers

The architecture should be organized into layers:

1. Client layer.
2. API layer.
3. Application service layer.
4. Domain layer.
5. Connector layer.
6. Infrastructure layer.
7. Observability layer.

### 4.3 Client Layer

The client layer includes:

- Browser extension.
- Web app.
- Later desktop app.
- Later mobile apps.
- Later bot companion.

Client responsibilities:

- User interaction.
- Authentication entry points.
- Provider connection flows.
- Transfer setup.
- Progress display.
- Report viewing.
- Settings.

Client non-responsibilities:

- Provider matching decisions.
- Transfer orchestration.
- Token storage strategy.
- Provider API abstraction.
- Sync conflict resolution.
- Core report generation.

### 4.4 API Layer

The API layer exposes controlled operations to clients:

- Connect provider account.
- List connected providers.
- List source library items.
- Start transfer.
- Check transfer status.
- Cancel transfer.
- View transfer report.
- Export UPF.
- Import UPF.
- Configure sync.
- View account settings.

API design must be stable, versioned when needed, and documented before implementation.

### 4.5 Domain Layer

The domain layer contains the core concepts:

- User.
- Provider account.
- Provider capability.
- Music item.
- Track.
- Album.
- Artist.
- Playlist.
- Library collection.
- UPF document.
- Transfer job.
- Transfer step.
- Match candidate.
- Match decision.
- Transfer report.
- Sync policy.
- Sync conflict.

Domain models should not depend on framework code.

### 4.6 Connector Layer

The connector layer translates provider-specific APIs into Ekusupo's common interface.

Each connector is responsible for:

- Authentication integration.
- Provider API calls.
- Rate-limit handling.
- Capability declaration.
- Provider error translation.
- Provider item normalization.
- Search behavior.
- Create/update operations supported by the provider.

Connectors must not orchestrate cross-provider transfers. That belongs to the transfer engine.

### 4.7 Infrastructure Layer

The infrastructure layer may include:

- Database.
- Cache.
- Queue.
- Background workers.
- Object storage.
- Secret storage.
- Logging.
- Metrics.
- Tracing.
- Deployment configuration.

Infrastructure implementation must not leak provider-specific behavior into the domain layer.

## 5. Universal Playlist Format

### 5.1 Purpose

Universal Playlist Format, or UPF, is Ekusupo's portable representation of playlist and library metadata.

UPF exists so that providers do not need direct pairwise conversions.

Instead of:

```text
Spotify -> Apple
Spotify -> YouTube
Apple -> Spotify
Apple -> YouTube
YouTube -> Spotify
YouTube -> Apple
```

Ekusupo should use:

```text
Provider -> UPF -> Provider
```

### 5.2 UPF Design Goals

UPF must be:

- Provider-neutral.
- Versioned.
- Human-readable where practical.
- Machine-validated.
- Extensible.
- Backward compatible where possible.
- Capable of preserving provider-specific metadata without making that metadata required.
- Suitable for export, import, backup, transfer, and debugging.

### 5.3 UPF Must Represent

UPF should eventually represent:

- Playlist identity.
- Playlist title.
- Playlist description.
- Playlist artwork references.
- Playlist privacy state where supported.
- Track order.
- Track metadata.
- Artist metadata.
- Album metadata.
- ISRC.
- UPC.
- Provider references.
- Source provider.
- Destination match history.
- Match confidence.
- Match reasoning.
- Unavailable item reasons.
- Region availability notes.
- Explicit content state.
- Creation and update timestamps.
- Export metadata.

### 5.4 UPF Versioning

Every UPF document must include:

- Format name.
- Format version.
- Exporting application name.
- Exporting application version.
- Export timestamp.

Example shape:

```json
{
  "format": "upf",
  "version": "0.1.0",
  "createdAt": "2026-07-22T00:00:00.000Z",
  "source": {
    "provider": "example-provider"
  },
  "playlists": []
}
```

The exact schema must be defined in dedicated documentation before production implementation.

### 5.5 Provider Extensions

UPF may include provider-specific extensions, but those extensions must be isolated.

Provider-specific extensions must never be required for another provider to interpret the common UPF document.

## 6. Connector SDK Philosophy

### 6.1 Purpose

The Connector SDK is the contract between Ekusupo Core and external music providers, file formats, and future integrations.

A connector should answer:

- What can this provider do?
- How does Ekusupo authenticate with it?
- How can Ekusupo read music data?
- How can Ekusupo search music data?
- How can Ekusupo write music data?
- How should provider errors be translated?
- How should rate limits be handled?

### 6.2 Connector Types

The architecture should support multiple connector types:

- Streaming provider connectors.
- Self-hosted library connectors.
- Local file connectors.
- Export format connectors.
- Import format connectors.
- Sharing connectors.
- Backup connectors.

Examples:

- Spotify.
- Apple Music.
- YouTube Music.
- Deezer.
- TIDAL.
- Amazon Music.
- SoundCloud where allowed.
- Plex.
- Jellyfin.
- Navidrome.
- Local files.
- CSV.
- JSON.
- M3U.
- UPF.
- Telegram companion later.

### 6.3 Connector Capabilities

Each connector must declare capabilities in a structured way.

Example capability categories:

- Authentication.
- Library reading.
- Playlist reading.
- Playlist creation.
- Playlist updating.
- Track search.
- Album search.
- Artist search.
- Saved tracks.
- Saved albums.
- Playlist artwork.
- Metadata fidelity.
- Sync support.
- Batch support.
- Rate limits.
- Regional availability.

### 6.4 Connector Contract

A connector should expose operations such as:

- `getCapabilities`.
- `authenticate`.
- `refreshAuthentication`.
- `listPlaylists`.
- `getPlaylist`.
- `createPlaylist`.
- `updatePlaylist`.
- `addTracksToPlaylist`.
- `removeTracksFromPlaylist`.
- `searchTracks`.
- `searchAlbums`.
- `searchArtists`.
- `listSavedTracks`.
- `listSavedAlbums`.
- `normalizeTrack`.
- `normalizePlaylist`.

The exact function signatures depend on the chosen language and package design. They must be documented before implementation.

### 6.5 Connector Isolation

Provider connectors must be isolated packages or modules.

A provider connector may depend on:

- Connector SDK types.
- Provider API client utilities.
- Shared HTTP utilities.
- Shared error utilities.
- Shared rate-limit utilities.

A provider connector must not depend on:

- Web app UI code.
- Browser extension UI code.
- Database persistence code unless explicitly abstracted.
- Other provider connectors.
- Transfer orchestration internals.

## 7. Browser Extension MVP

### 7.1 Purpose

The browser extension should make Ekusupo available directly where users already manage music.

It should detect supported music pages and provide quick actions without forcing users to start from the web dashboard.

### 7.2 MVP Behavior

The browser extension MVP should support:

- Detecting supported provider pages.
- Identifying whether the page is a playlist, album, track, artist, or library view where feasible.
- Opening Ekusupo transfer flow for the detected item.
- Showing provider connection state.
- Letting the user send the current item to the web app workflow.
- Displaying transfer progress summaries.
- Showing recent transfer results.

### 7.3 Extension Boundaries

The extension must not:

- Contain provider transfer business logic.
- Store provider OAuth tokens insecurely.
- Scrape private user data where official APIs and OAuth are required.
- Circumvent provider restrictions.
- Make irreversible changes without confirmation.

### 7.4 Extension Design

The extension should be:

- Fast.
- Quiet.
- Non-intrusive.
- Accessible.
- Clear about what provider and item it detected.
- Consistent with the web app.

## 8. Web App MVP

### 8.1 Purpose

The web app is the primary dashboard for Ekusupo.

It should handle:

- Account setup.
- Provider connections.
- Transfer setup.
- Reports.
- History.
- Settings.
- UPF import/export.

### 8.2 MVP Screens

The web app MVP should include:

- Landing or start screen focused on the product workflow, not marketing.
- Sign-in screen.
- Connected providers screen.
- Provider connection flow.
- Source selection.
- Destination selection.
- Item selection.
- Transfer confirmation.
- Transfer progress.
- Transfer report.
- Transfer history.
- UPF export and import.
- Account settings.

### 8.3 UX Principles

The web app should:

- Prefer clarity over decoration.
- Show what will happen before it happens.
- Explain provider limitations before transfers start.
- Show progress during long operations.
- Explain failures in plain language.
- Let users review matches when confidence is low.
- Keep advanced controls available without overwhelming beginners.

## 9. Transfer Engine

### 9.1 Purpose

The transfer engine orchestrates movement from one supported source to one supported destination.

It must be provider-agnostic.

### 9.2 Transfer Flow

Standard transfer flow:

```text
Validate request
        |
Check source capabilities
        |
Check destination capabilities
        |
Read source data
        |
Normalize into Ekusupo domain models
        |
Export or transform into UPF where needed
        |
Search and match destination items
        |
Classify match decisions
        |
Create or update destination items
        |
Generate report
        |
Persist history
```

### 9.3 Transfer Requirements

The transfer engine should support:

- Idempotency.
- Retryable jobs.
- Cancellation.
- Resume after interruption where possible.
- Progress reporting.
- Partial success.
- Clear failure classification.
- Rate-limit awareness.
- Dry-run mode.
- Preview mode.
- User confirmation for destructive or ambiguous actions.

### 9.4 Transfer Reports

Every transfer should produce a report containing:

- Source provider.
- Destination provider.
- Item type.
- Total items.
- Matched items.
- Created items.
- Skipped items.
- Failed items.
- Low-confidence matches.
- Unavailable items.
- Provider limitations encountered.
- User actions required.
- Exportable report data.

## 10. Matching Engine

### 10.1 Purpose

The matching engine determines how source music items map to destination music items.

### 10.2 Matching Strategy

Use layered matching:

1. Exact provider identifiers where relevant.
2. ISRC or UPC.
3. Normalized title and primary artist.
4. Album and release metadata.
5. Duration tolerance.
6. Explicit or clean version compatibility.
7. Featured artist handling.
8. Regional availability.
9. Popularity and canonical release hints.
10. AI-assisted reasoning for ambiguous cases.

### 10.3 Match Confidence

Every match decision should have:

- Confidence score.
- Match method.
- Explanation.
- Risk level.
- Alternatives when available.

Example:

```text
Confidence: 98.7 percent
Reason: Same ISRC, matching primary artist, duration differs by 0.8 seconds.
Risk: Low
```

### 10.4 Human Review

Low-confidence matches should be reviewable by users.

The system should avoid silently making poor matches.

## 11. AI Usage Policy

### 11.1 Acceptable AI Uses

AI may be used for:

- Explaining match decisions.
- Ranking ambiguous candidates.
- Suggesting replacements.
- Detecting likely duplicates.
- Summarizing transfer reports.
- Helping users understand provider limitations.
- Playlist health analysis.
- Metadata repair suggestions.
- Natural language commands in later versions.

### 11.2 Unacceptable AI Uses

AI must not be used to:

- Fabricate provider results.
- Hide uncertainty.
- Bypass provider rules.
- Replace authentication.
- Generate copyrighted music downloads.
- Make irreversible changes without user confirmation.
- Store sensitive user data in third-party AI services without explicit policy and consent.

### 11.3 AI Transparency

When AI contributes to a decision, the system should expose:

- That AI was involved.
- What evidence was used.
- Confidence level.
- Alternatives.
- Whether user confirmation is recommended.

### 11.4 AI Optionality

Core transfer workflows must still function without AI.

AI should improve quality, not define basic correctness.

## 12. Security Principles

### 12.1 OAuth and Provider Tokens

Provider authentication must use official OAuth or approved authentication mechanisms where available.

Tokens must be:

- Stored securely.
- Encrypted at rest.
- Never exposed to frontend code beyond what is strictly required.
- Refreshable through controlled backend flows.
- Revocable by the user.

### 12.2 Least Privilege

Request the smallest provider scopes required for the user-selected feature.

Do not request write access when the user only wants to analyze or export.

### 12.3 Secrets

Secrets must not be committed.

Secrets include:

- OAuth client secrets.
- API keys.
- Database URLs with credentials.
- Signing keys.
- Encryption keys.
- Webhook secrets.

Use environment variables, secret managers, or deployment platform secrets.

### 12.4 User Data

User data must be treated as sensitive.

This includes:

- Connected provider accounts.
- Playlist names.
- Listening libraries.
- Transfer history.
- Match reports.
- Saved exports.

### 12.5 Auditability

Important user-affecting actions should be auditable:

- Connecting a provider.
- Starting a transfer.
- Creating a playlist.
- Updating a playlist.
- Deleting or disconnecting account data.
- Exporting user data.

### 12.6 Abuse Prevention

Design for:

- Rate limiting.
- Input validation.
- CSRF protection where applicable.
- XSS prevention.
- Secure cookie settings.
- Safe redirects.
- API authorization checks.
- Provider rate-limit compliance.

## 13. Performance Principles

### 13.1 Performance Goals

Ekusupo should handle:

- Large playlists.
- Large saved libraries.
- Slow provider APIs.
- Provider rate limits.
- Long-running transfer jobs.
- Intermittent failures.

### 13.2 Async Work

Long-running transfers should run as background jobs, not blocking HTTP requests.

The system should support:

- Job queues.
- Progress events.
- Retries.
- Backoff.
- Cancellation.
- Resume where feasible.

### 13.3 Rate Limits

Every connector must understand provider rate limits.

The transfer engine must not assume unlimited calls.

### 13.4 Caching

Caching may be used for:

- Provider metadata.
- Search results.
- Capability descriptors.
- Non-sensitive normalized music metadata.

Caching must respect privacy and provider policies.

### 13.5 Observability

Production systems should expose:

- Structured logs.
- Metrics.
- Traces.
- Job status.
- Provider error rates.
- Match quality metrics.
- Transfer success rates.

## 14. Repository Strategy

### 14.1 Preferred Repository Shape

Use a monorepo unless a future decision explicitly changes this.

Recommended high-level layout:

```text
apps/
  web/
  extension/
  desktop/

packages/
  core/
  connector-sdk/
  upf/
  matching/
  shared/
  ui/

services/
  api/
  worker/

docs/
  vision.md
  product-requirements.md
  system-architecture.md
  connector-sdk.md
  universal-playlist-format.md
  ai-matching-engine.md
  browser-extension.md
  web-app.md
  security.md
  testing.md
  decisions/

infra/
scripts/
tests/
examples/
```

The exact tooling may change, but the separation of concerns should remain.

### 14.2 Root Files

The repository should eventually include:

- `README.md`.
- `CLAUDE.md`.
- `LICENSE`.
- `CONTRIBUTING.md`.
- `SECURITY.md`.
- `CODE_OF_CONDUCT.md`.
- `CHANGELOG.md`.
- `ROADMAP.md`.
- `.gitignore`.
- `.editorconfig`.
- `.gitattributes`.
- `.github/`.

## 15. Development Workflow

### 15.1 Standard Feature Lifecycle

Every significant feature follows this lifecycle:

```text
Idea
  |
Questions
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
  |
Merge
```

### 15.2 Before Editing

Before editing code or docs:

- Read relevant existing files.
- Understand local patterns.
- Check for related documentation.
- Identify whether the change affects architecture.
- Avoid rewriting unrelated work.

### 15.3 Planning Requirements

For non-trivial work, produce a short plan covering:

- Scope.
- Files likely to change.
- Risks.
- Test approach.
- Documentation updates.

### 15.4 Implementation Requirements

Implementation must:

- Be scoped to the requested change.
- Follow existing project patterns.
- Preserve provider-agnostic boundaries.
- Include tests where behavior changes.
- Update documentation where decisions change.
- Avoid unrelated refactors.

## 16. Coding Standards

### 16.1 General Standards

Code should be:

- Typed.
- Readable.
- Modular.
- Tested.
- Documented where necessary.
- Consistent with local conventions.
- Easy to delete or replace.

### 16.2 Avoid

Avoid:

- Hidden global state.
- Provider-specific conditionals in core code.
- Business logic in UI components.
- Duplicate matching logic.
- Hardcoded provider assumptions.
- Silent failure.
- Unstructured errors.
- Large files with unrelated responsibilities.
- Premature microservices.
- Premature abstraction without real need.

### 16.3 Error Handling

Errors should be:

- Typed or classified.
- Actionable.
- User-safe when shown to users.
- Detailed enough in logs for debugging.
- Mapped from provider-specific errors into Ekusupo error categories.

Example categories:

- Authentication error.
- Authorization error.
- Rate-limit error.
- Provider unavailable.
- Unsupported capability.
- Validation error.
- Match failure.
- Partial transfer failure.
- User action required.

### 16.4 Configuration

Use configuration for:

- Provider credentials.
- API base URLs.
- Feature flags.
- Environment-specific behavior.
- Rate limits.
- AI provider settings.

Do not hardcode environment-specific values.

## 17. Testing Standards

### 17.1 Test Types

Use the following test categories:

- Unit tests.
- Integration tests.
- Connector contract tests.
- API tests.
- End-to-end tests.
- Browser extension tests.
- Web app component tests.
- Security tests where relevant.
- Performance tests for large transfers.

### 17.2 Connector Contract Tests

Every provider connector must pass shared contract tests.

Contract tests should verify:

- Capability declaration.
- Authentication behavior where mockable.
- Error mapping.
- Search result normalization.
- Playlist normalization.
- Unsupported capability handling.
- Rate-limit handling.

### 17.3 Matching Tests

The matching engine must include fixture-based tests for:

- Exact ISRC matches.
- Same song on different album editions.
- Remastered versions.
- Clean versus explicit versions.
- Live versus studio versions.
- Karaoke or cover mismatches.
- Featured artist variations.
- Duration differences.
- Missing or malformed metadata.

### 17.4 Transfer Tests

Transfer tests should cover:

- Successful full transfer.
- Partial transfer.
- Provider capability mismatch.
- Rate-limit retry.
- Cancellation.
- Resume where implemented.
- Low-confidence match review.
- Report generation.

### 17.5 Test Rule

Code without appropriate tests is incomplete unless the change is documentation-only or a tiny non-behavioral maintenance edit.

## 18. Documentation Standards

### 18.1 Documentation Locations

Use Markdown for durable project documentation.

Core documentation belongs in:

```text
docs/
```

Architecture decisions belong in:

```text
docs/decisions/
```

### 18.2 Required Documentation For Features

For major features, document:

- Problem.
- Goals.
- Non-goals.
- User behavior.
- Architecture.
- Data model.
- API contract.
- Security considerations.
- Test strategy.
- Rollout plan.
- Open questions.

### 18.3 Architecture Decision Records

Use ADRs for decisions that materially affect:

- Architecture.
- Tech stack.
- Data model.
- Provider abstraction.
- Authentication.
- Deployment.
- Security.
- AI policy.
- API versioning.

ADR format:

```text
# ADR-0001: Title

Status: Proposed | Accepted | Superseded

## Context
## Decision
## Consequences
## Alternatives Considered
```

### 18.4 Keep Docs Current

If code changes behavior, documentation must change with it.

Outdated docs are worse than missing docs because they mislead contributors.

## 19. Git Workflow

### 19.1 Branches

Recommended branches:

- `main` for stable code.
- Feature branches for new work.
- Documentation branches for larger documentation changes.

Example branch names:

```text
docs/initial-architecture
feature/connector-sdk
feature/upf-schema
feature/extension-detection
fix/matching-confidence
```

### 19.2 Commit Messages

Use conventional commit style where practical:

```text
docs: add initial engineering constitution
feat: add connector capability model
fix: handle unsupported provider capability
test: add matching fixtures for remastered tracks
chore: configure linting
```

### 19.3 Pull Requests

Pull requests should include:

- Summary.
- Motivation.
- Implementation notes.
- Tests run.
- Documentation changed.
- Screenshots for UI changes.
- Known limitations.

### 19.4 Review Priorities

Review for:

- Correctness.
- Provider-agnostic boundaries.
- Security.
- Data privacy.
- Test coverage.
- Documentation accuracy.
- Maintainability.
- User impact.

## 20. UI and UX Standards

### 20.1 Product UX

The product should be calm, clear, and useful.

Avoid over-decorated interfaces that make transfer status or provider limitations harder to understand.

### 20.2 User Trust

Before starting a transfer, show:

- Source.
- Destination.
- Item type.
- Number of items when known.
- Required permissions.
- Destination changes.
- Provider limitations.
- Whether low-confidence matches need review.

After a transfer, show:

- What succeeded.
- What failed.
- What changed.
- What needs user action.
- What can be retried.

### 20.3 Accessibility

Interfaces must be usable with:

- Keyboard navigation.
- Screen readers.
- Sufficient contrast.
- Clear focus states.
- Responsive layouts.

## 21. Privacy and Data Retention

### 21.1 Data Minimization

Store only what is needed to provide the user-requested functionality.

### 21.2 User Control

Users should be able to:

- Disconnect providers.
- Delete stored provider tokens.
- Delete transfer history where feasible.
- Export their metadata.
- Understand what data Ekusupo stores.

### 21.3 Sensitive Logs

Logs must not include:

- Access tokens.
- Refresh tokens.
- Client secrets.
- Private provider identifiers when unnecessary.
- Full user libraries unless explicitly needed for debugging and safely protected.

## 22. Release Philosophy

### 22.1 MVP Before Expansion

Do not add many providers before the core is correct.

First prove:

- UPF.
- Connector SDK.
- Transfer engine.
- Matching engine.
- Reports.
- Browser extension and web app integration.

Then add more providers.

### 22.2 Compatibility

When public data formats or APIs are introduced, treat backward compatibility seriously.

Breaking changes must be documented.

### 22.3 Feature Flags

Use feature flags for risky or experimental behavior:

- AI ranking.
- Automatic repair.
- Sync automation.
- New provider connectors.
- Destructive playlist updates.

## 23. Definition of Done

A feature is done only when:

- The behavior is implemented.
- Provider-agnostic boundaries are preserved.
- Relevant tests are added or updated.
- Documentation is added or updated.
- Errors are handled.
- Security implications are considered.
- Performance implications are considered.
- User-facing behavior is clear.
- Edge cases are handled or explicitly documented.
- The change can be reviewed without hidden assumptions.

For UI features, done also means:

- Empty states exist.
- Loading states exist.
- Error states exist.
- Success states exist.
- Keyboard and screen reader basics are considered.
- Responsive behavior is checked.

For connector features, done also means:

- Capabilities are declared.
- Unsupported operations fail clearly.
- Provider errors are mapped.
- Rate limits are considered.
- Contract tests pass.

For AI features, done also means:

- Deterministic fallback exists where needed.
- AI uncertainty is visible.
- User confirmation exists for risky actions.
- Sensitive data handling is documented.

## 24. Assistant Behavior Rules

When Claude Code or another AI assistant works in this repository:

1. Read this file first.
2. Read relevant docs before editing.
3. Do not assume Spotify or any provider is central.
4. Do not implement provider-specific logic in the core.
5. Do not write product code before the architecture is documented.
6. Do not skip tests for behavioral changes.
7. Do not add broad abstractions without a specific need.
8. Do not change unrelated files.
9. Do not silently ignore security concerns.
10. Do not invent provider capabilities.
11. Do not claim a provider supports an action without verification.
12. Ask questions when requirements are ambiguous and risky.
13. Prefer small, reviewable changes.
14. Update documentation when behavior changes.
15. Explain tradeoffs in implementation plans.

## 25. Current Strategic Direction

The immediate direction is documentation-first repository foundation.

Initial files should establish:

- Mission and vision.
- Product scope.
- Provider-agnostic architecture.
- UPF.
- Connector SDK.
- Browser extension MVP.
- Web app MVP.
- Development workflow.
- Testing expectations.
- Security principles.
- AI usage policy.
- Definition of Done.

No production feature implementation should begin until the core documentation set is in place and reviewed.

