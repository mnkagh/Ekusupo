# Contributing to Ekusupo

Start with [`CLAUDE.md`](CLAUDE.md). It is the engineering constitution
for this repository — provider-agnostic boundaries, the definition of
done, and the testing rules all live there, and a change that violates it
will not be merged however good the code is.

## Getting it running

```sh
npm install -g pnpm@11.15.1   # or `corepack enable`, admin shell on Windows
pnpm install
pnpm build
```

Then follow [`docs/running-and-testing.md`](docs/running-and-testing.md),
which is explicit about what works with no external accounts and what
needs credentials only you can obtain.

## Before you open a pull request

```sh
pnpm build         # tsc -b across every package
pnpm lint          # eslint
pnpm format:check  # prettier
pnpm test          # vitest
pnpm audit         # dependency vulnerabilities
```

All five must pass. CI runs the same five on every push.

## What a good change looks like

- **Scoped.** One concern per pull request. Unrelated refactors make a
  change hard to review and harder to revert.
- **Tested.** Behaviour changes need tests. The rule in CLAUDE.md §17.5
  is that code without appropriate tests is incomplete, and it is meant
  literally — most of the bugs found in this project were found by
  writing the test that should already have existed.
- **Documented where it changes behaviour.** If the docs say something
  that your change makes untrue, fixing that is part of the change.
  Outdated documentation is worse than none.
- **Honest about its limits.** If something does not work, or has only
  been tested against a fake, say so — in the code comment, in the PR,
  and in `docs/running-and-testing.md` §8 if a user could hit it.

## Adding a provider connector

Connectors are isolated packages under `packages/providers/`. A new one
must:

1. Declare its capabilities honestly. Never claim an operation the
   provider's API cannot actually perform — the transfer engine reads
   these and will route real user data based on them.
2. Map provider errors into the shared `ConnectorError` categories.
3. Pass the shared connector contract tests.
4. Depend on nothing in `apps/`, `services/`, or another connector.

## Commit messages

Conventional commits, one short imperative line:

```
feat: add capability descriptor for Deezer
fix: keep non-Latin titles when matching
docs: record the YouTube quota ceiling
```

## Architecture decisions

Anything that materially affects architecture, the data model, provider
abstraction, authentication, deployment, security, or AI policy needs an
ADR in [`docs/decisions/`](docs/decisions/). Copy the format of an
existing one — context, decision, consequences, alternatives considered.
The alternatives section is not a formality; it is the part that is
useful in a year.
