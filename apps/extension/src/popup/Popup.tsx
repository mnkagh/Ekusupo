import { useEffect, useState } from "react";

import { sendToBackground } from "../shared/message-bus.js";
import type { TransferPanelState } from "../shared/messages.js";
import { describeTransferPanelState } from "../shared/transfer-panel-state.js";

/**
 * Shows the active tab's last known transfer status, if any —
 * `background/tab-transfer-status-store.ts` is the source of truth, not
 * local state, so this reflects what happened even if it started before
 * the popup was opened. See docs/browser-extension.md "Progress UI" and
 * ADR-0015.
 */
export function Popup() {
  const [transferState, setTransferState] = useState<TransferPanelState | null>(null);

  useEffect(() => {
    let cancelled = false;

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0]?.id;
      if (tabId === undefined) return;

      void sendToBackground("GetTabTransferState", { tabId })
        .then((response) => {
          if (!cancelled) setTransferState(response.state);
        })
        .catch(() => {
          // No background listener yet, or the tab has no recorded state —
          // stay on the initial null (renders nothing extra).
        });
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const statusText = transferState ? describeTransferPanelState(transferState) : null;

  return (
    <main>
      <h1>Ekusupo</h1>
      <p>Move, sync, and back up your music library across providers.</p>
      {statusText && <p data-state={transferState?.kind}>{statusText}</p>}
    </main>
  );
}
