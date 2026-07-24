// PR4 adds UI injection on top of what's detected here. Local imports are
// fine — they get inlined into this single self-contained bundle by
// vite.content.config.ts; see ADR-0007 for why this entry can't share a
// chunk with popup/background instead.
import { DetectorRegistry } from "../shared/detector-registry.js";
import { spotifyDetector } from "./detectors/spotify.js";
import { watchLocationChanges } from "./spa-navigation-watcher.js";

const registry = new DetectorRegistry([spotifyDetector]);

function reportDetection(url: string): void {
  const resource = registry.detect(url);
  console.log("[Ekusupo] detected resource", resource);
}

reportDetection(window.location.href);
watchLocationChanges(reportDetection);
