# ADR-0013: Browser Extension Progress UI (PR6)

Status: Accepted

## Context

PR5 (ADR-0012) made `UserClickedTransfer` run a real Dry Run, but its
outcome only reached the service worker's console — nothing in the page
UI reflected it. `docs/browser-extension.md` scoped PR6 as "surfacing
`runTransfer`'s `onProgress` events and final `TransferReport` in the
popup/injected UI," with the user's explicit instruction that "the UI
reflects the Transfer Engine's own state machine — it does not invent its
own progress model."

The messaging contract for this already existed since PR2
(`TransferProgress`, `TransferCompleted`, `TransferFailed`), documented as
"Background → Popup." But the button that starts a transfer lives in the
**injected panel** (`content/`), not the popup — and the popup
(`Popup.tsx`) has no UI at all yet. Rendering progress only where the user
can't see the button that triggered it would be a real usability gap, not
a faithful implementation of what PR5 built.

## Decision

1. **Send progress to the tab, not (only) the popup.** `service-worker.ts`
   now calls `sendToTab(tabId, ...)` for all three message types, using
   `sender.tab?.id` captured from the original `UserClickedTransfer`
   message. This extends, rather than contradicts, the existing
   "Background → Popup" messages — the message _types_ don't change, just
   which surface the extension currently renders them on. Popup rendering
   remains a later, separately-scoped problem (see "Deferred").
2. **A local per-attempt id, not the engine's job id.** `runDryRunTransfer`
   only returns its internal `TransferJob.id` once the whole call
   resolves — `onProgress` fires before that's known. `newAttemptId()`
   in `service-worker.ts` generates the extension's own id up front. This
   is safe because content never correlates by id (see decision 4) — it's
   carried in the payload only because `TransferProgressPayload` already
   has a required `jobId` field from PR2's contract.
3. **`ActionPanel` renders a `TransferState` union
   (`idle | running | completed | failed`) built directly from the wire
   payloads** — `step`/`processed`/`total` from `TransferProgressPayload`,
   `summary` from `TransferReportSummary`, `reason` from `TransferFailed`.
   No new vocabulary invented on top of what the engine already reports,
   per the user's explicit instruction.
4. **No jobId correlation in `content-script.ts`.** At most one transfer
   is active per tab (there's exactly one panel, one Transfer button).
   Whatever `TransferProgress`/`Completed`/`Failed` message arrives is
   applied to whatever the panel is currently showing. This mirrors
   ADR-0008's own reasoning for skipping request-ID correlation in the
   message bus itself — solving a concurrency problem that doesn't exist
   yet would be premature.
5. **`InjectionManager` remembers the last `resource`/`callbacks`** so
   `updateTransferState()` can re-render without a full `show()` call. A
   fresh `show()` (new detected resource) resets state to `idle` — a
   newly shown resource has no relationship to whatever finished on the
   previous one.
6. **Optimistic local state on click.** `onTransfer` sets `{ kind:
"running", step: "starting" }` immediately, before the message
   round-trip completes, so the button visibly responds rather than
   appearing to do nothing for the round-trip latency.

## Consequences

- Clicking Transfer today shows real state in the panel: a disabled
  button with the current step while running, a match/skip/fail summary
  on completion, or the exact failure reason (today, always "spotify
  isn't connected yet" — see ADR-0012) on failure.
- The popup still shows nothing transfer-related. Not an oversight —
  see "Deferred."
- `TransferProgressPayload`'s `jobId` is extension-local, not the
  Transfer Engine's own job id. Anyone adding real job-status polling
  later (`GetTransferStatus`, already defined but unused) needs to decide
  whether to reconcile these two ids or keep them separate — flagged, not
  solved here.

## Deferred / Not This PR

- **Popup progress display.** MV3 popups are ephemeral — a popup closed
  during a transfer never saw any of these messages, and there's no
  durable store (`chrome.storage`, or a real backend once `services/api`
  exists) to show "last known status" on reopen. Building a
  popup view now would either be misleadingly incomplete or require
  a persistence decision out of scope for "surface what PR5 already
  produces." `docs/browser-extension.md` already flagged this limitation
  before this PR; it remains flagged, not solved.
- **Live Transfer progress.** Out of scope until a second provider makes
  Live Transfer meaningful (ROADMAP.md v0.3.0-alpha).

## Alternatives Considered

- **Only send to popup, per the letter of PR2's original comment.**
  Rejected — popup has no UI and isn't where the user clicked; shipping a
  PR that "surfaces progress" nowhere the user can see it would satisfy
  the letter of the earlier doc but not its purpose.
- **Give `TransferProgressPayload` an optional `jobId` and skip
  generating one.** Rejected — the field is already required by PR2's
  contract; making it optional now to avoid picking a value would be a
  wire-protocol change for no real benefit, when a locally generated id
  is honest about what it is (documented in decision 2) and costs nothing.
- **Correlate messages to jobs with a `Map<jobId, PanelState>` in
  `content-script.ts`.** Rejected — over-built for "at most one transfer
  per tab." Add it if/when multiple concurrent transfers per tab becomes
  a real requirement, not preemptively.
