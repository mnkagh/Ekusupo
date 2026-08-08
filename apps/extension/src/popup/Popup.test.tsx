// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { TransferPanelState } from "../shared/messages.js";
import { Popup } from "./Popup.js";

// This project doesn't set vitest's `test.globals: true`, so RTL's
// auto-cleanup (which detects a global `afterEach`) never registers —
// every React component test file needs this explicitly.
afterEach(cleanup);

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Same hand-rolled-fake style as shared/message-bus.test.ts. */
function installFakeChrome(state: TransferPanelState | undefined) {
  vi.stubGlobal("chrome", {
    tabs: {
      query: (_query: unknown, callback: (tabs: chrome.tabs.Tab[]) => void) => {
        callback([{ id: 7 } as chrome.tabs.Tab]);
      },
    },
    runtime: {
      sendMessage: () =>
        state === undefined
          ? Promise.reject(new Error("no state recorded"))
          : Promise.resolve({ state }),
    },
  });
}

describe("Popup", () => {
  it("renders the Ekusupo heading", () => {
    installFakeChrome({ kind: "idle" });
    render(<Popup />);
    expect(screen.getByRole("heading", { name: "Ekusupo" })).toBeDefined();
  });

  it("shows no status text while idle", async () => {
    installFakeChrome({ kind: "idle" });
    render(<Popup />);
    expect(await screen.findByRole("heading")).toBeDefined();
    expect(screen.queryByText(/Failed|Done|running/i)).toBeNull();
  });

  it("shows the active tab's last known status once it resolves", async () => {
    installFakeChrome({ kind: "failed", reason: "spotify isn't connected yet" });
    render(<Popup />);

    expect(await screen.findByText("Failed: spotify isn't connected yet")).toBeDefined();
  });

  it("renders nothing extra when there's no recorded state for this tab", async () => {
    installFakeChrome(undefined);
    render(<Popup />);

    expect(await screen.findByRole("heading")).toBeDefined();
    expect(screen.queryByText(/Failed|Done/i)).toBeNull();
  });
});
