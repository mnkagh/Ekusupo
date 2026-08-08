import { describe, expect, it } from "vitest";

import { DetectorRegistry } from "./detector-registry.js";
import type { ResourceDetector } from "./detector-registry.js";

function fakeDetector(provider: string, matchesHost: string): ResourceDetector {
  return {
    provider,
    detect: (url) =>
      url.includes(matchesHost)
        ? { provider, resourceType: "playlist", resourceId: "fake-id" }
        : null,
  };
}

describe("DetectorRegistry", () => {
  it("returns null when no detectors are registered", () => {
    const registry = new DetectorRegistry();
    expect(registry.detect("https://example.com")).toBeNull();
  });

  it("returns null when no registered detector matches", () => {
    const registry = new DetectorRegistry([fakeDetector("a", "a.example.com")]);
    expect(registry.detect("https://b.example.com")).toBeNull();
  });

  it("returns the first matching detector's result", () => {
    const registry = new DetectorRegistry([
      fakeDetector("a", "example.com"),
      fakeDetector("b", "example.com"),
    ]);

    expect(registry.detect("https://example.com/x")).toEqual({
      provider: "a",
      resourceType: "playlist",
      resourceId: "fake-id",
    });
  });

  it("register() adds a detector after construction", () => {
    const registry = new DetectorRegistry();
    registry.register(fakeDetector("late", "late.example.com"));

    expect(registry.detect("https://late.example.com")).toEqual({
      provider: "late",
      resourceType: "playlist",
      resourceId: "fake-id",
    });
  });
});
