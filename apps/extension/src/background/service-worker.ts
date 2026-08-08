// Preview and Copy UPF stay logging-only until they're scoped to a PR.
// See docs/browser-extension.md.
import { getProvider } from "./provider-registry.js";
import { SessionStore } from "./session-store.js";
import { runDryRunTransferForResource, summarizeReport } from "./transfer-orchestrator.js";
import { onMessage, sendToTab } from "../shared/message-bus.js";

const sessions = new SessionStore();

chrome.runtime.onInstalled.addListener(() => {
  console.log("[Ekusupo] background service worker installed");
});

/**
 * `runDryRunTransfer`'s own job id isn't known until the call resolves
 * (see ADR-0012/ADR-0013), so this is the extension's own per-attempt id
 * — good enough for tagging this tab's TransferProgress/Completed/Failed
 * messages, since there's at most one active transfer per tab and content
 * doesn't correlate by id anyway.
 */
function newAttemptId(): string {
  return `attempt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Push messages to a tab that may have navigated away or closed mid
 * transfer — that's an accepted, already-documented limitation (see
 * docs/browser-extension.md), not a bug to surface as an unhandled
 * rejection.
 */
function notifyTab(tabId: number | undefined, send: (id: number) => void): void {
  if (tabId === undefined) return;
  send(tabId);
}

onMessage("UserClickedTransfer", async ({ resource }, sender) => {
  console.log("[Ekusupo] UserClickedTransfer received", resource);
  const tabId = sender.tab?.id;
  const jobId = newAttemptId();

  await runDryRunTransferForResource(resource, {
    getProvider,
    getSession: (provider) => sessions.get(provider),
    onProgress: (event) =>
      notifyTab(tabId, (id) => {
        void sendToTab(id, "TransferProgress", { jobId, ...event }).catch(() => {});
      }),
    onCompleted: (report) =>
      notifyTab(tabId, (id) => {
        void sendToTab(id, "TransferCompleted", { jobId, report: summarizeReport(report) }).catch(
          () => {},
        );
      }),
    onFailed: (reason) =>
      notifyTab(tabId, (id) => {
        void sendToTab(id, "TransferFailed", { jobId, reason }).catch(() => {});
      }),
  });

  return { acknowledged: true };
});

onMessage("PreviewRequested", ({ resource }) => {
  console.log("[Ekusupo] PreviewRequested received", resource);
  return { acknowledged: true };
});

onMessage("CopyUpfRequested", ({ resource }) => {
  console.log("[Ekusupo] CopyUpfRequested received", resource);
  return { acknowledged: true };
});
