import type { TransferPanelState } from "./messages.js";

/**
 * One formatting function shared by the injected panel and the popup, so
 * "what does this state say" has a single definition instead of two
 * copies drifting apart. See docs/browser-extension.md "Progress UI".
 */
export function describeTransferPanelState(state: TransferPanelState): string | null {
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
