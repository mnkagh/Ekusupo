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
  `packages/core`'s own in-test fakes.
- `cross-provider-live-transfer.test.ts` — `runLiveTransfer`, same two
  connectors, proving ADR-0018's write-through mode for real: Spotify's
  tracks actually land in a real UPF file on disk, byte for byte, with no
  destination catalog search involved. Confirms `ROADMAP.md`'s
  "cross-provider Live Transfer" for the write-through case; the
  match-based case (streaming-to-streaming) still only has fake-provider
  coverage — see ADR-0016.
