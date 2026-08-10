// Local imports are fine — they get inlined into this single
// self-contained bundle by vite.content.config.ts; see ADR-0007 for why
// this entry can't share a chunk with popup/background instead.
import { DetectorRegistry } from "../shared/detector-registry.js";
import { onMessage, sendToBackground } from "../shared/message-bus.js";
import type { DetectedResource } from "../shared/messages.js";
import { appleMusicDetector } from "./detectors/apple-music.js";
import { spotifyDetector } from "./detectors/spotify.js";
import { youtubeMusicDetector } from "./detectors/youtube-music.js";
import { InjectionManager } from "./injection-manager.js";
import { watchLocationChanges } from "./spa-navigation-watcher.js";

// Order is irrelevant to correctness here — each detector is scoped to a
// single hostname, so at most one can ever claim a given URL.
const registry = new DetectorRegistry([spotifyDetector, appleMusicDetector, youtubeMusicDetector]);
const injectionManager = new InjectionManager();

function handleDetection(resource: DetectedResource): void {
  injectionManager.show(resource, {
    onTransfer: () => {
      // Optimistic — the first real TransferProgress event ("validating")
      // arrives a message round-trip later.
      injectionManager.updateTransferState({ kind: "running", step: "starting" });
      void sendToBackground("UserClickedTransfer", { resource });
    },
    onPreview: () => {
      void sendToBackground("PreviewRequested", { resource });
    },
    onCopyUpf: () => {
      void sendToBackground("CopyUpfRequested", { resource });
    },
  });
}

function reportDetection(url: string): void {
  const resource = registry.detect(url);
  console.log("[Ekusupo] detected resource", resource);

  if (resource) {
    handleDetection(resource);
  } else {
    injectionManager.hide();
  }
}

// Background pushes these unsolicited as a Dry Run progresses — see
// docs/browser-extension.md "Progress UI" and ADR-0013. There's at most
// one active transfer per tab, so no jobId correlation is needed here;
// whatever arrives applies to whatever's currently shown.
onMessage("TransferProgress", ({ step, processed, total }) => {
  injectionManager.updateTransferState({ kind: "running", step, processed, total });
  return { acknowledged: true };
});

onMessage("TransferCompleted", ({ report }) => {
  injectionManager.updateTransferState({ kind: "completed", summary: report });
  return { acknowledged: true };
});

onMessage("TransferFailed", ({ reason }) => {
  injectionManager.updateTransferState({ kind: "failed", reason });
  return { acknowledged: true };
});

reportDetection(window.location.href);
watchLocationChanges(reportDetection);
