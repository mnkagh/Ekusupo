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

const CATALOG = {
  providers: [
    {
      id: "spotify",
      displayName: "Spotify",
      authKind: "oauth2",
      configured: true,
      requiredEnv: ["SPOTIFY_CLIENT_ID"],
    },
    {
      id: "apple-music",
      displayName: "Apple Music",
      authKind: "serverToken",
      configured: false,
      requiredEnv: ["APPLE_MUSIC_DEVELOPER_TOKEN"],
    },
    {
      id: "youtube-music",
      displayName: "YouTube Music",
      authKind: "oauth2",
      configured: false,
      requiredEnv: ["YOUTUBE_CLIENT_ID"],
    },
  ],
};

/**
 * The screen reads three endpoints: the catalog (what *can* be
 * connected), the connection list (what already is), and the caller's
 * own stored provider apps. All three must be stubbed — the catalog is
 * what decides whether a Connect control is offered at all, and the
 * credentials decide whether the tile offers to use your own app.
 */
function stubApi(
  connected: { provider: string; connectedAt: string }[],
  catalog = CATALOG,
  credentials: unknown[] = [],
) {
  return vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    if (init?.method === "DELETE") return jsonResponse({ disconnected: true });
    const href = url.toString();
    if (href.includes("/providers/catalog")) return jsonResponse(catalog);
    if (href.includes("/providers/credentials")) return jsonResponse({ credentials });
    return jsonResponse({ providers: connected });
  });
}

describe("ProvidersScreen", () => {
  it("shows a Connect link for a provider the server is configured for", async () => {
    vi.stubGlobal("fetch", stubApi([]));
    render(<ProvidersScreen />);

    const link = (await screen.findByRole("link", {
      name: "Connect Spotify",
    })) as HTMLAnchorElement;
    expect(link.href).toContain("/providers/spotify/connect");
  });

  it("offers no Connect control for a provider the server has no credentials for", async () => {
    vi.stubGlobal("fetch", stubApi([]));
    render(<ProvidersScreen />);

    await screen.findByRole("link", { name: "Connect Spotify" });
    // A button that would fail on click is worse than no button.
    expect(screen.queryByRole("link", { name: "Connect YouTube Music" })).toBeNull();
    expect(screen.getAllByText("Needs an app").length).toBeGreaterThan(0);
  });

  it("tells the user how to enable it themselves, not which env vars an operator forgot", async () => {
    // Naming server environment variables is useless to someone who is
    // not the operator — and wrong now that they can supply their own
    // app instead of waiting for one.
    vi.stubGlobal("fetch", stubApi([]));
    render(<ProvidersScreen />);

    expect(await screen.findByText(/Add your own YouTube Music app/)).toBeDefined();
    expect(screen.getAllByRole("button", { name: "Use my own app" }).length).toBeGreaterThan(0);
  });

  it("offers to use your own app only where a user can actually supply one", async () => {
    // Apple Music authorizes with a developer token the operator signs
    // out of band; there is nothing for an end user to paste.
    vi.stubGlobal("fetch", stubApi([]));
    render(<ProvidersScreen />);

    await screen.findByRole("link", { name: "Connect Spotify" });
    // Spotify and YouTube are oauth2; Apple Music is not.
    expect(screen.getAllByRole("button", { name: /Use my own app|Replace my app/ })).toHaveLength(
      2,
    );
  });

  it("shows which of your own apps is in use, without ever showing the secret", async () => {
    vi.stubGlobal(
      "fetch",
      stubApi([], CATALOG, [
        { provider: "youtube-music", clientIdPreview: "abcd…wxyz", hasSecret: true, updatedAt: "" },
      ]),
    );
    render(<ProvidersScreen />);

    expect(await screen.findByText(/Your app · abcd…wxyz/)).toBeDefined();
  });

  it("shows Connected and a Disconnect button when a provider is connected", async () => {
    vi.stubGlobal(
      "fetch",
      stubApi([{ provider: "spotify", connectedAt: "2026-01-01T00:00:00.000Z" }]),
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
        const href = url.toString();
        if (href.includes("/providers/catalog")) return jsonResponse(CATALOG);
        if (href.includes("/providers/credentials")) return jsonResponse({ credentials: [] });
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

  it("renders an empty list rather than blanking when the API is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ error: "boom" }, 500)),
    );
    render(<ProvidersScreen />);

    // Still shows the panel and every provider as unconfigured, instead
    // of leaving the user on a permanent loading state.
    expect(await screen.findByText("Providers")).toBeDefined();
  });
});
