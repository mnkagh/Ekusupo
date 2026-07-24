import { flushSync } from "react-dom";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";

import type { DetectedResource } from "../shared/messages.js";
import type { ActionPanelCallbacks } from "./ui/ActionPanel.js";
import { ActionPanel } from "./ui/ActionPanel.js";

const HOST_ELEMENT_ID = "ekusupo-root";

/**
 * :host { all: initial } stops the shadow tree from inheriting anything
 * from wherever it lands in the host page — style isolation is
 * bidirectional. See docs/browser-extension.md "UI injection" and
 * ADR-0010.
 */
const PANEL_STYLES = `
  :host { all: initial; }
  .ekusupo-panel {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    background: #121212;
    color: #ffffff;
    border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 13px;
  }
  .ekusupo-panel__label {
    font-weight: 600;
    white-space: nowrap;
  }
  .ekusupo-panel__actions {
    display: flex;
    gap: 6px;
  }
  .ekusupo-panel__actions button {
    cursor: pointer;
    border: none;
    border-radius: 999px;
    padding: 6px 12px;
    background: #1db954;
    color: #121212;
    font-weight: 600;
    font-size: 12px;
  }
  .ekusupo-panel__actions button:hover {
    background: #1ed760;
  }
`;

/**
 * Owns DOM/React lifecycle for the injected panel only — no messaging
 * knowledge. show()/hide() are idempotent: repeated show() calls
 * re-render instead of re-injecting, and hide() fully unmounts and
 * removes the host. See docs/browser-extension.md "UI injection".
 */
export class InjectionManager {
  private hostElement: HTMLElement | null = null;
  private reactRoot: Root | null = null;

  show(resource: DetectedResource, callbacks: ActionPanelCallbacks): void {
    if (!this.hostElement) {
      // Defends against the content script somehow running twice; any
      // stray element from a prior run is treated as stale.
      document.getElementById(HOST_ELEMENT_ID)?.remove();

      this.hostElement = document.createElement("div");
      this.hostElement.id = HOST_ELEMENT_ID;
      this.hostElement.style.cssText =
        "position: fixed; bottom: 16px; right: 16px; z-index: 2147483647;";
      document.body.appendChild(this.hostElement);

      const shadowRoot = this.hostElement.attachShadow({ mode: "open" });
      const styleElement = document.createElement("style");
      styleElement.textContent = PANEL_STYLES;
      shadowRoot.appendChild(styleElement);

      const mountPoint = document.createElement("div");
      shadowRoot.appendChild(mountPoint);

      this.reactRoot = createRoot(mountPoint);
    }

    // flushSync rather than a plain render(): a page navigation can hide
    // this panel again immediately after, so the DOM needs to reflect
    // this update synchronously rather than on React's own schedule.
    flushSync(() => {
      this.reactRoot?.render(<ActionPanel resource={resource} {...callbacks} />);
    });
  }

  hide(): void {
    this.reactRoot?.unmount();
    this.reactRoot = null;
    this.hostElement?.remove();
    this.hostElement = null;
  }
}
