# ADR-0015: Popup Transfer Status via `chrome.storage.session`

Status: Accepted

## Context

ADR-0013 deliberately deferred popup progress display: MV3 popups are
ephemeral (only receive push messages while open), and there was no
durable store to show "last known status" on reopen without either
misrepresenting incomplete data or waiting on `services/api`.

Revisiting this: `services/api` isn't the only way to persist small,
session-scoped state. `chrome.storage.session` (Chrome 102+) is exactly
what this needs — in-memory, cleared when the browser closes, but
critically it **survives the MV3 service worker being terminated and
restarted**, which a plain module-scope variable in `service-worker.ts`
would not. That's the actual gap ADR-0013 was pointing at, and it doesn't
require a backend, a database, or any of the bigger decisions
`services/api` would bring with it.

## Decision

1. **`background/tab-transfer-status-store.ts`** wraps
   `chrome.storage.session`, keyed by tab id (`transfer-state:<tabId>`).
   Two functions, `getTabTransferState`/`setTabTransferState` — no class,
   no abstraction beyond what two functions need.
2. **State is keyed by tab, not job id.** The popup knows which tab it's
   looking at (`chrome.tabs.query({ active: true, currentWindow: true })`)
   before it knows anything about a job. This is why `GetTransferStatus`
   (defined in PR2, never implemented) is replaced outright by
   `GetTabTransferState: { payload: { tabId }; response: { state:
TransferPanelState } }` rather than kept alongside it — the old shape
   (`{ jobId }` → `{ status: TransferStatus }`) doesn't fit how a popup
   can actually ask this question, and nothing depended on the old shape
   since it was never implemented.
3. **`TransferPanelState` moves to `shared/messages.ts`** (was
   `ActionPanel.tsx`'s private `TransferState`) since it now crosses the
   message boundary in `GetTabTransferState`'s response, not just a
   component prop. `content/ui/ActionPanel.tsx` and `popup/Popup.tsx`
   both import it from there, and both use the new
   `shared/transfer-panel-state.ts#describeTransferPanelState` — one
   formatting function instead of two copies.
4. **`service-worker.ts` writes to the store at the same point it calls
   `sendToTab`** (`publishTransferState`), so the two never drift: every
   state a tab is pushed is also the state the popup will see if opened
   afterward.
5. **`TransferStatus` (the `TransferJobStatus`-mirroring 7-state union)
   is deleted, not kept "for later."** It was already unused outside the
   message entry this ADR replaces. A future real job-status feature
   (once a durable job store exists) should shape its own type from real
   requirements rather than inherit a guess from PR2.

## Consequences

- Opening the popup at any point — before, during, or after a transfer —
  shows the correct current state for whichever tab is active, not just
  "nothing" unless it happened to be open at the right moment.
- New `"storage"` permission in `manifest.json` — the first PR whose code
  actually reads/writes `chrome.storage`.
- State is still per-browser-session, not durable across a browser
  restart. That's an intentional scope line, not an oversight: durability
  across restarts needs a real decision about where state should live
  long-term (`services/api` + a database, most likely), which is a much
  bigger question than "does the popup show something sensible right
  now."

## Alternatives Considered

- **Wait for `services/api`.** Rejected — no timeline for that existing,
  and this doesn't need a backend to be correct; `chrome.storage.session`
  solves the actual problem (service worker restarts) the popup had.
- **Keep both `GetTransferStatus` (jobId-based) and add
  `GetTabTransferState` (tabId-based) side by side.** Rejected — the old
  message was never implemented by anything; keeping an unused, wrongly
  shaped entry around "just in case" is exactly the dead code CLAUDE.md
  §16.2 warns against, not a hedge worth paying for.
- **`chrome.storage.local` instead of `.session`.** Rejected for now —
  `.local` persists across browser restarts, which would show stale
  "transfer completed 3 days ago" state with no expiry story. `.session`'s
  browser-close-clears-it behavior matches how long this information is
  actually still useful.
