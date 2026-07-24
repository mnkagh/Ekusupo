import type { DetectedResource } from "../../shared/messages.js";

export interface ActionPanelCallbacks {
  onTransfer: () => void;
  onPreview: () => void;
  onCopyUpf: () => void;
}

export interface ActionPanelProps extends ActionPanelCallbacks {
  resource: DetectedResource;
}

/**
 * Presentational only — no messaging, no business logic. content-script.ts
 * supplies the callbacks. See docs/browser-extension.md "UI injection"
 * and ADR-0010.
 */
export function ActionPanel({ resource, onTransfer, onPreview, onCopyUpf }: ActionPanelProps) {
  return (
    <div className="ekusupo-panel">
      <span className="ekusupo-panel__label">
        Ekusupo · {resource.provider} {resource.resourceType}
      </span>
      <div className="ekusupo-panel__actions">
        <button type="button" onClick={onTransfer}>
          Transfer
        </button>
        <button type="button" onClick={onPreview}>
          Preview
        </button>
        <button type="button" onClick={onCopyUpf}>
          Copy UPF
        </button>
      </div>
    </div>
  );
}
