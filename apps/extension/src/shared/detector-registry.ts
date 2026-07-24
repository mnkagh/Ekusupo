import type { DetectedResource } from "./messages.js";

/**
 * Provider-agnostic contract, like @ekusupo/connector-sdk's role for the
 * backend. Concrete implementations (e.g. the Spotify detector) live in
 * content/detectors/, not here — see docs/browser-extension.md
 * "Resource detection" and ADR-0009.
 */
export interface ResourceDetector {
  /** Stable provider slug, e.g. "spotify". */
  readonly provider: string;
  /** Pure — no DOM, no I/O. Returns null if `url` isn't a supported resource on this provider. */
  detect(url: string): DetectedResource | null;
}

export class DetectorRegistry {
  private readonly detectors: ResourceDetector[] = [];

  constructor(detectors: ResourceDetector[] = []) {
    this.detectors.push(...detectors);
  }

  register(detector: ResourceDetector): void {
    this.detectors.push(detector);
  }

  /** Runs registered detectors in registration order; returns the first match. */
  detect(url: string): DetectedResource | null {
    for (const detector of this.detectors) {
      const resource = detector.detect(url);
      if (resource) return resource;
    }
    return null;
  }
}
