// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ProvidersScreen } from "./ProvidersScreen.js";

afterEach(cleanup);
afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("ProvidersScreen", () => {
  it("shows a Connect Spotify link when nothing is connected", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ providers: [] })),
    );
    render(<ProvidersScreen />);

    const link = (await screen.findByRole("link", {
      name: "Connect Spotify",
    })) as HTMLAnchorElement;
    expect(link.href).toContain("/providers/spotify/connect");
  });

  it("shows Connected + a Disconnect button when Spotify is already connected", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          providers: [{ provider: "spotify", connectedAt: "2026-01-01T00:00:00.000Z" }],
        }),
      ),
    );
    render(<ProvidersScreen />);

    expect(await screen.findByText("Connected")).toBeDefined();
    expect(screen.getByRole("button", { name: "Disconnect" })).toBeDefined();
  });

  it("disconnecting calls the API and refreshes back to the Connect link", async () => {
    let connected = true;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        if (init?.method === "DELETE") {
          connected = false;
          return jsonResponse({ disconnected: true });
        }
        return jsonResponse({
          providers: connected
            ? [{ provider: "spotify", connectedAt: "2026-01-01T00:00:00.000Z" }]
            : [],
        });
      }),
    );
    render(<ProvidersScreen />);

    fireEvent.click(await screen.findByRole("button", { name: "Disconnect" }));

    expect(await screen.findByRole("link", { name: "Connect Spotify" })).toBeDefined();
  });
});
