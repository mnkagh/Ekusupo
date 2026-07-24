// PR5 replaces the UserClickedTransfer stub below with a real call into
// @ekusupo/core's runTransfer via @ekusupo/providers/spotify. Preview and
// Copy UPF stay logging-only until they're scoped to a PR. See
// docs/browser-extension.md.
import { onMessage } from "../shared/message-bus.js";

chrome.runtime.onInstalled.addListener(() => {
  console.log("[Ekusupo] background service worker installed");
});

onMessage("UserClickedTransfer", ({ resource }) => {
  console.log("[Ekusupo] UserClickedTransfer received", resource);
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
