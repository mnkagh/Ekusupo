// PR6 replaces the console logging below with real TransferProgress /
// TransferCompleted / TransferFailed messages back to the tab. Preview and
// Copy UPF stay logging-only until they're scoped to a PR. See
// docs/browser-extension.md.
import { getProvider } from "./provider-registry.js";
import { SessionStore } from "./session-store.js";
import { runDryRunTransferForResource, summarizeReport } from "./transfer-orchestrator.js";
import { onMessage } from "../shared/message-bus.js";

const sessions = new SessionStore();

chrome.runtime.onInstalled.addListener(() => {
  console.log("[Ekusupo] background service worker installed");
});

onMessage("UserClickedTransfer", async ({ resource }) => {
  console.log("[Ekusupo] UserClickedTransfer received", resource);

  await runDryRunTransferForResource(resource, {
    getProvider,
    getSession: (provider) => sessions.get(provider),
    onProgress: (event) => console.log("[Ekusupo] transfer progress", event),
    onCompleted: (report) => console.log("[Ekusupo] transfer completed", summarizeReport(report)),
    onFailed: (reason) => console.warn("[Ekusupo] transfer failed", reason),
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
