# @ekusupo/tests-integration

CLAUDE.md §14.1 reserves a top-level `tests/` directory for exactly this:
tests that exercise two or more real packages together, which no single
package's own test suite can do without violating its own boundary
rules. In particular, `packages/core` may never import a provider
package directly (ADR-0002, enforced by `coreNeverImportsProvidersDirectly`
in `eslint.config.js`) — not even from a test file, since that rule's
glob covers `packages/core/**/*.ts` with no test exemption. A test that
wants to run `@ekusupo/core`'s `runDryRunTransfer` against two _real_
connector packages (not the fakes `packages/core/src/run-transfer.test.ts`
uses) has to live somewhere that isn't bound by that rule — here.

## What's here

- `cross-provider-dry-run.test.ts` — `runDryRunTransfer` with
  `@ekusupo/provider-spotify` (fake-fetch-backed, same fixture style as
  that package's own tests — no live network call) as source and
  `@ekusupo/provider-upf-file` (a real temp file) as destination. This is
  the first proof that provider-agnostic orchestration works across two
  independently-implemented real connectors, not just against
  `packages/core`'s own in-test fakes. See ADR-0016 for why this
  demonstrates Dry Run specifically, not Live Transfer.
