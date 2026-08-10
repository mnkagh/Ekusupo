import { browserApi } from "../shared/browser-api.js";
import type { TransferPanelState } from "../shared/messages.js";

const IDLE_STATE: TransferPanelState = { kind: "idle" };

/**
 * `chrome.storage.session` is the whole point here: in-memory, cleared
 * when the browser closes, but — unlike a plain module-scope variable —
 * it survives the MV3 service worker itself being terminated and
 * restarted mid-session, so a popup opened after the worker went idle
 * still sees the last known state. See ADR-0015.
 */
function storageKey(tabId: number): string {
  return `transfer-state:${tabId}`;
}

export async function getTabTransferState(tabId: number): Promise<TransferPanelState> {
  const key = storageKey(tabId);
  const stored = await browserApi.storage.session.get(key);
  return (stored[key] as TransferPanelState | undefined) ?? IDLE_STATE;
}

export async function setTabTransferState(tabId: number, state: TransferPanelState): Promise<void> {
  await browserApi.storage.session.set({ [storageKey(tabId)]: state });
}
