// Placeholder — PR5 wires this to @ekusupo/core's runTransfer via
// @ekusupo/providers/spotify. For now it only proves the service worker
// starts. See docs/browser-extension.md.
chrome.runtime.onInstalled.addListener(() => {
  console.log("[Ekusupo] background service worker installed");
});
