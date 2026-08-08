# ADR-0017: Web Dashboard Tech Stack (`apps/web`, `services/api`, Database, Auth)

Status: Accepted — all four recommendations (React + Vite, Fastify,
PostgreSQL, own session-based auth) confirmed by the user with no
constraints raised.

## Context

ADR-0001 deliberately left `apps/web` and `services/api`'s frameworks
open — "framework/bundler choices... remain deferred; they're not needed
to scaffold empty placeholders." Both are still exactly that: an empty
`PACKAGE_NAME` export each, per `apps/web/src/index.ts` and
`services/api/src/index.ts`.

`ROADMAP.md`'s v0.3.0-alpha now has nothing left blocking the Web
Dashboard except this decision. It's a bigger, harder-to-reverse call
than anything built so far this phase (a UI framework, a backend
framework, a database, and an auth strategy all commit the project to
real migration cost if changed later), so — per the standing rule and
CLAUDE.md §24.12 ("Ask questions when requirements are ambiguous and
risky") — this is options, not a decision made on your behalf.

Four sub-decisions, because they're coupled but not identical questions:

## 1. `apps/web` framework

| Option                                       | For                                                                                                                                                                                                                                                        | Against                                                                                                                                                                                                                                                    |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. React + Vite (SPA)**                    | Same stack `apps/extension` already uses (ADR-0007) — direct pattern reuse, and real component sharing via the already-reserved (empty) `packages/ui`. No SSR complexity for what's fundamentally a signed-in dashboard, not a marketing site needing SEO. | No SSR — fine today, would need revisiting only if a public/marketing surface is added later.                                                                                                                                                              |
| B. Next.js                                   | Batteries included: routing, SSR, API routes.                                                                                                                                                                                                              | Its API routes create a second place to put backend logic, tempting scope creep that duplicates `services/api` — exactly what CLAUDE.md §3.3 forbids ("do not duplicate... business logic in UI components"). Heavier for a problem that doesn't need SSR. |
| C. A different framework (Svelte, Vue, etc.) | Some have smaller bundles / different ergonomics.                                                                                                                                                                                                          | Introduces a second UI framework into the monorepo for no functional need `apps/extension` doesn't already answer; fragments `packages/ui`.                                                                                                                |

**Recommendation: A.**

## 2. `services/api` framework

| Option                         | For                                                                                                                                                                                                                                                                                                                                                | Against                                                                                                                                                   |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Node.js + Fastify**       | Stays TypeScript end-to-end — imports `@ekusupo/core` as a plain workspace dependency, zero duplication of domain types (`packages/upf`'s `Track`/`Playlist` etc. are already TS). Lightweight, strong schema-validation ecosystem (zod/typebox), matches "the problem is small enough to solve directly" reasoning already used in ADR-0007/0008. | Less batteries-included than a full framework — auth, sessions, etc. are separate choices (addressed below).                                              |
| B. Express                     | Most ubiquitous.                                                                                                                                                                                                                                                                                                                                   | Weaker native TypeScript ergonomics, more manual wiring for what Fastify provides directly.                                                               |
| C. NestJS                      | Full-featured, DI-based structure.                                                                                                                                                                                                                                                                                                                 | Heavier ceremony (decorators, modules) than the current scope needs — the same "avoid premature abstraction" reasoning CLAUDE.md §16.2 states repeatedly. |
| D. Non-Node (Go, Python, etc.) | Some ecosystems have mature auth/ORM tooling.                                                                                                                                                                                                                                                                                                      | Breaks TypeScript-only consistency (ADR-0001); every UPF/domain type would need re-modeling in a second language.                                         |

**Recommendation: A.**

## 3. Database

| Option            | For                                                                                                                                                                                                                                                                                                                                                                                                       | Against                                                                                                                                                                                                |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **A. PostgreSQL** | Naturally fits the actual data (users, provider connections, transfer jobs, reports — relational, with foreign-key integrity worth having). Strong TypeScript ORM support (Drizzle, Prisma). Self-hostable, matching the project's own "self-hosted deployment options" future vision (CLAUDE.md §2.3) and avoiding exactly the vendor lock-in Ekusupo itself exists to fight for users' music libraries. | Requires running a real database in local dev (vs. zero-setup).                                                                                                                                        |
| B. SQLite         | Zero setup, great for local dev, could even be shared with a future Desktop app.                                                                                                                                                                                                                                                                                                                          | Weaker for concurrent multi-user web production load; a real multi-tenant dashboard would likely need to migrate to Postgres eventually anyway — better to start where the project is actually headed. |
| C. MongoDB        | Flexible for storing report-shaped JSON blobs directly.                                                                                                                                                                                                                                                                                                                                                   | The core domain is relational (users → connections → jobs), not document-shaped; picking Mongo fights the data's natural structure for no real benefit.                                                |

**Recommendation: A**, likely via Drizzle (lighter, more SQL-transparent
than Prisma, strong type inference) — though the ORM itself is an
implementation detail that doesn't need deciding in this ADR.

## 4. Auth strategy

Two distinct things, worth naming separately:

**(a) How a user signs into Ekusupo itself** (CLAUDE.md §8.2's sign-in
screen):

| Option                                                                                                     | For                                                                                                                                                                        | Against                                                                                                                                                                                       |
| ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Own session-based auth** (e.g. Lucia, or a minimal hand-rolled password+session-table implementation) | No third-party dependency or recurring cost; self-hosting stays possible end to end; consistent with ADR-0008's "the problem is small enough to solve directly" precedent. | More to build and get right (password hashing, session security) than an off-the-shelf service.                                                                                               |
| B. Auth-as-a-service (Clerk, Auth0, Supabase Auth, WorkOS)                                                 | Fast to bootstrap; offloads security-sensitive code.                                                                                                                       | A recurring third-party dependency for a project whose entire premise is fighting vendor lock-in — self-hosting Ekusupo would mean also depending on an external auth vendor, an awkward fit. |

**Recommendation: A.**

**(b) How `services/api` holds provider OAuth credentials** (the actual
blocker ADR-0014 identified): this falls out of picking A/A/A above, not
a separate framework choice — a `clientId`/encrypted-`clientSecret` per
provider in server-side config (env vars, never committed — CLAUDE.md
§12.3), per-user provider tokens encrypted at rest in Postgres (§12.1).
Once `services/api` and a database exist, ADR-0014's Spotify OAuth gap
has somewhere correct to live; still needs the actual Spotify Developer
app registration (external credential) regardless of stack.

## Decision confirmed

Confirmed: React + Vite, Fastify, PostgreSQL, own session-based auth — no
additional constraints raised. Tooling scaffolding for `apps/web` and
`services/api` follows the same "tooling ADR first, then real code"
sequencing `apps/extension` used (ADR-0007) — a separate, dedicated ADR
per app once each is actually built out, not folded into this one.

## Consequences if adopted

- `packages/ui` (currently an empty placeholder) gets real components
  shared between `apps/web` and, where relevant, `apps/extension`.
- `services/api` becomes the only thing besides `apps/extension`'s
  `background/` allowed to import `@ekusupo/core`/`connector-sdk`/
  provider packages directly — the same boundary pattern
  `eslint.config.js` already enforces for the extension extends naturally
  here.
- A new `docs/web-app.md` and `docs/api.md` (or similar) would follow,
  matching the documentation-first pattern every other subsystem in this
  repo has had before implementation (CLAUDE.md §3.5).
