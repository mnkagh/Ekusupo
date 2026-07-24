// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import type { DetectedResource } from "../shared/messages.js";
import { InjectionManager } from "./injection-manager.js";

const resource: DetectedResource = {
  provider: "spotify",
  resourceType: "playlist",
  resourceId: "abc123",
};

function noopCallbacks() {
  return { onTransfer: vi.fn(), onPreview: vi.fn(), onCopyUpf: vi.fn() };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("InjectionManager", () => {
  it("show() creates exactly one host element with a shadow root", () => {
    const manager = new InjectionManager();
    manager.show(resource, noopCallbacks());

    const hosts = document.querySelectorAll("#ekusupo-root");
    expect(hosts).toHaveLength(1);
    expect(hosts[0]?.shadowRoot).not.toBeNull();
  });

  it("calling show() again re-renders without creating a second host", () => {
    const manager = new InjectionManager();
    manager.show(resource, noopCallbacks());
    manager.show({ ...resource, resourceId: "different" }, noopCallbacks());

    expect(document.querySelectorAll("#ekusupo-root")).toHaveLength(1);
  });

  it("hide() removes the host element", () => {
    const manager = new InjectionManager();
    manager.show(resource, noopCallbacks());
    manager.hide();

    expect(document.querySelectorAll("#ekusupo-root")).toHaveLength(0);
  });

  it("show() after hide() recreates the host correctly", () => {
    const manager = new InjectionManager();
    manager.show(resource, noopCallbacks());
    manager.hide();
    manager.show(resource, noopCallbacks());

    expect(document.querySelectorAll("#ekusupo-root")).toHaveLength(1);
  });

  it("wires callbacks through to the rendered buttons inside the shadow root", () => {
    const onTransfer = vi.fn();
    const manager = new InjectionManager();
    manager.show(resource, { ...noopCallbacks(), onTransfer });

    const host = document.getElementById("ekusupo-root");
    const transferButton = host?.shadowRoot?.querySelector("button");
    transferButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(onTransfer).toHaveBeenCalledTimes(1);
  });
});
