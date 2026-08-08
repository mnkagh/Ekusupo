import type { DetectedResource, TransferPanelState } from "../../shared/messages.js";
import { describeTransferPanelState } from "../../shared/transfer-panel-state.js";

export interface ActionPanelCallbacks {
  onTransfer: () => void;
  onPreview: () => void;
  onCopyUpf: () => void;
}

export interface ActionPanelProps extends ActionPanelCallbacks {
  resource: DetectedResource;
  transferState: TransferPanelState;
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
  const statusText = describeTransferPanelState(transferState);
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
