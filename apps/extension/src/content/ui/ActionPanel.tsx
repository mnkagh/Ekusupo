import type { DetectedResource, TransferReportSummary } from "../../shared/messages.js";

export interface ActionPanelCallbacks {
  onTransfer: () => void;
  onPreview: () => void;
  onCopyUpf: () => void;
}

/**
 * Mirrors the Transfer Engine's own state machine (PR6 doesn't invent its
 * own progress model, per the user's explicit instruction) — `step` comes
 * straight from `TransferProgressPayload`, `summary` from
 * `TransferReportSummary`. See docs/browser-extension.md "Progress UI".
 */
export type TransferState =
  | { kind: "idle" }
  | { kind: "running"; step: string; processed?: number; total?: number }
  | { kind: "completed"; summary: TransferReportSummary }
  | { kind: "failed"; reason: string };

export interface ActionPanelProps extends ActionPanelCallbacks {
  resource: DetectedResource;
  transferState: TransferState;
}

function describeTransferState(state: TransferState): string | null {
  switch (state.kind) {
    case "idle":
      return null;
    case "running":
      return state.processed !== undefined && state.total !== undefined
        ? `${state.step} (${state.processed}/${state.total})`
        : state.step;
    case "completed":
      return `Done — ${state.summary.matchedItems}/${state.summary.totalItems} matched, ${state.summary.skippedItems} skipped, ${state.summary.failedItems} failed`;
    case "failed":
      return `Failed: ${state.reason}`;
  }
}

/**
 * Presentational only — no messaging, no business logic. content-script.ts
 * supplies the callbacks and drives `transferState` from
 * TransferProgress/TransferCompleted/TransferFailed messages. See
 * docs/browser-extension.md "UI injection" / "Progress UI" and ADR-0010 /
 * ADR-0013.
 */
export function ActionPanel({
  resource,
  transferState,
  onTransfer,
  onPreview,
  onCopyUpf,
}: ActionPanelProps) {
  const statusText = describeTransferState(transferState);
  const isRunning = transferState.kind === "running";

  return (
    <div className="ekusupo-panel">
      <span className="ekusupo-panel__label">
        Ekusupo · {resource.provider} {resource.resourceType}
      </span>
      <div className="ekusupo-panel__actions">
        <button type="button" onClick={onTransfer} disabled={isRunning}>
          {isRunning ? "Transferring…" : "Transfer"}
        </button>
        <button type="button" onClick={onPreview}>
          Preview
        </button>
        <button type="button" onClick={onCopyUpf}>
          Copy UPF
        </button>
      </div>
      {statusText && (
        <p className="ekusupo-panel__status" data-state={transferState.kind}>
          {statusText}
        </p>
      )}
    </div>
  );
}
