// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Options } from "./Options.js";

// See apps/extension/src/popup/Popup.test.tsx for why this is explicit.
afterEach(cleanup);

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Same hand-rolled-fake style as shared/message-bus.test.ts and Popup.test.tsx. */
function installFakeChrome(options: {
  launchWebAuthFlowResult?: string;
  authenticateResult?: { connected: boolean };
  storedClientId?: string;
}) {
  const storage = new Map<string, unknown>(
    options.storedClientId ? [["spotify-client-id", options.storedClientId]] : [],
  );

  vi.stubGlobal("chrome", {
    identity: {
      getRedirectURL: () => "https://abc.chromiumapp.org/",
      launchWebAuthFlow: (
        _details: { url: string; interactive: boolean },
        callback: (responseUrl?: string) => void,
      ) => callback(options.launchWebAuthFlowResult),
    },
    storage: {
      local: {
        get: async (key: string) => ({ [key]: storage.get(key) }),
        set: async (items: Record<string, unknown>) => {
          for (const [key, value] of Object.entries(items)) storage.set(key, value);
        },
      },
    },
    runtime: {
      sendMessage: async () => options.authenticateResult ?? { connected: false },
    },
  });
}

describe("Options", () => {
  it("renders the redirect URI so the user can register it with Spotify", async () => {
    installFakeChrome({});
    render(<Options />);

    expect(await screen.findByText("https://abc.chromiumapp.org/")).toBeDefined();
  });

  it("loads a previously saved Client ID on mount", async () => {
    installFakeChrome({ storedClientId: "saved-client-id" });
    render(<Options />);

    const input = (await screen.findByLabelText("Spotify Client ID")) as HTMLInputElement;
    await waitFor(() => expect(input.value).toBe("saved-client-id"));
  });

  it("disables Connect until a Client ID is entered", async () => {
    installFakeChrome({});
    render(<Options />);

    expect(screen.getByRole("button", { name: "Connect Spotify" }).hasAttribute("disabled")).toBe(
      true,
    );
  });

  it("shows Connected after a successful PKCE flow", async () => {
    installFakeChrome({
      launchWebAuthFlowResult: "https://abc.chromiumapp.org/?code=abc123",
      authenticateResult: { connected: true },
    });
    render(<Options />);

    fireEvent.change(screen.getByLabelText("Spotify Client ID"), {
      target: { value: "my-client-id" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Connect Spotify" }));

    expect((await screen.findByRole("status")).textContent).toBe("Connected.");
  });

  it("shows a failure message when the exchange doesn't succeed", async () => {
    installFakeChrome({
      launchWebAuthFlowResult: "https://abc.chromiumapp.org/?code=abc123",
      authenticateResult: { connected: false },
    });
    render(<Options />);

    fireEvent.change(screen.getByLabelText("Spotify Client ID"), {
      target: { value: "my-client-id" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Connect Spotify" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/Could not connect/);
  });
});
