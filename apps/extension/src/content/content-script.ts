// Local imports are fine — they get inlined into this single
// self-contained bundle by vite.content.config.ts; see ADR-0007 for why
// this entry can't share a chunk with popup/background instead.
import { DetectorRegistry } from "../shared/detector-registry.js";
import { sendToBackground } from "../shared/message-bus.js";
import type { DetectedResource } from "../shared/messages.js";
import { spotifyDetector } from "./detectors/spotify.js";
import { InjectionManager } from "./injection-manager.js";
import { watchLocationChanges } from "./spa-navigation-watcher.js";

const registry = new DetectorRegistry([spotifyDetector]);
const injectionManager = new InjectionManager();

function handleDetection(resource: DetectedResource): void {
  injectionManager.show(resource, {
    onTransfer: () => {
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

reportDetection(window.location.href);
watchLocationChanges(reportDetection);
