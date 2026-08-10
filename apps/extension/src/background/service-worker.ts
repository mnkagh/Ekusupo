// Preview and Copy UPF stay logging-only until they're scoped to a PR.
// See docs/browser-extension.md.
import { getProvider } from "./provider-registry.js";
import { SessionStore } from "./session-store.js";
import { getTabTransferState, setTabTransferState } from "./tab-transfer-status-store.js";
import { runDryRunTransferForResource, summarizeReport } from "./transfer-orchestrator.js";
import { onMessage, sendToTab } from "../shared/message-bus.js";
import type { TransferPanelState } from "../shared/messages.js";

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

/**
 * Pushes a state to the tab (if any) and persists it for the popup —
 * one call site per outcome instead of duplicating both concerns at
 * every `onProgress`/`onCompleted`/`onFailed` call. See ADR-0015.
 */
function publishTransferState(
  tabId: number | undefined,
  jobId: string,
  state: TransferPanelState,
): void {
  notifyTab(tabId, (id) => {
    void setTabTransferState(id, state).catch(() => {});

    if (state.kind === "running") {
      void sendToTab(id, "TransferProgress", { jobId, ...state }).catch(() => {});
    } else if (state.kind === "completed") {
      void sendToTab(id, "TransferCompleted", { jobId, report: state.summary }).catch(() => {});
    } else if (state.kind === "failed") {
      void sendToTab(id, "TransferFailed", { jobId, reason: state.reason }).catch(() => {});
    }
  });
}

onMessage("UserClickedTransfer", async ({ resource }, sender) => {
  console.log("[Ekusupo] UserClickedTransfer received", resource);
  const tabId = sender.tab?.id;
  const jobId = newAttemptId();

  await runDryRunTransferForResource(resource, {
    getProvider,
    getSession: (provider) => sessions.get(provider),
    onProgress: (event) => publishTransferState(tabId, jobId, { kind: "running", ...event }),
    onCompleted: (report) =>
      publishTransferState(tabId, jobId, { kind: "completed", summary: summarizeReport(report) }),
    onFailed: (reason) => publishTransferState(tabId, jobId, { kind: "failed", reason }),
  });

  return { acknowledged: true };
});

onMessage("GetTabTransferState", async ({ tabId }) => ({
  state: await getTabTransferState(tabId),
}));

/**
 * `options/` has already run the PKCE redirect and has a `code` in hand
 * — this only does the token exchange and holds the resulting session.
 * See ADR-0014/ADR-0019/ADR-0020.
 */
onMessage(
  "AuthenticateProvider",
  async ({ provider, code, redirectUri, codeVerifier, clientId }) => {
    const providerInstance = getProvider(provider, { clientId });
    if (!providerInstance) return { connected: false };

    try {
      const session = await providerInstance.authenticate({
        method: "oauth2",
        raw: { code, redirectUri, codeVerifier },
      });
      await sessions.set(provider, session);
      return { connected: true };
    } catch (error) {
      console.warn("[Ekusupo] AuthenticateProvider failed", error);
      return { connected: false };
    }
  },
);

onMessage("PreviewRequested", ({ resource }) => {
  console.log("[Ekusupo] PreviewRequested received", resource);
  return { acknowledged: true };
});

onMessage("CopyUpfRequested", ({ resource }) => {
  console.log("[Ekusupo] CopyUpfRequested received", resource);
  return { acknowledged: true };
});
