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
      credentialSource: "server",
      requiredEnv: ["SPOTIFY_CLIENT_ID"],
    },
    {
      id: "youtube-music",
      displayName: "YouTube Music",
      authKind: "oauth2",
      configured: false,
      credentialSource: "none",
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

  it("tells the reader what they can do about an unconfigured provider", async () => {
    // Naming server environment variables is useless to someone who is
    // not the operator; supplying their own app is something they can
    // actually act on.
    vi.stubGlobal("fetch", stubApi([]));
    render(<ProvidersScreen />);

    expect(await screen.findByText(/add your own YouTube Music app below/)).toBeDefined();
  });

  it("makes bringing your own app prominent when nothing else can enable the provider", async () => {
    // With no server credentials this is the only control on the tile
    // that does anything — hiding it behind an "advanced" aside left a
    // provider that simply could not be enabled.
    vi.stubGlobal("fetch", stubApi([]));
    render(<ProvidersScreen />);

    expect(await screen.findByText("Set up YouTube Music with your own app")).toBeDefined();
  });

  it("hides bring-your-own-app entirely while the deployment's keys connect the provider", async () => {
    // End users connect with a click and sign in on Spotify's own page;
    // developer-app forms are not part of their flow at all.
    vi.stubGlobal("fetch", stubApi([]));
    render(<ProvidersScreen />);

    await screen.findByRole("link", { name: "Connect Spotify" });
    expect(screen.queryByText("Advanced: use your own developer app")).toBeNull();
  });

  it("reveals bring-your-own-app only behind the explicit advanced toggle", async () => {
    vi.stubGlobal("fetch", stubApi([]));
    render(<ProvidersScreen />);

    fireEvent.click(
      await screen.findByRole("button", { name: /Advanced · bring your own developer app/ }),
    );
    expect(await screen.findByText("Advanced: use your own developer app")).toBeDefined();
  });

  it("shows which of your own apps is in use, without ever showing the secret", async () => {
    vi.stubGlobal(
      "fetch",
      stubApi([], CATALOG, [
        { provider: "youtube-music", clientIdPreview: "abcd…wxyz", hasSecret: true, updatedAt: "" },
      ]),
    );
    render(<ProvidersScreen />);

    expect(await screen.findByText(/Using your own app · abcd…wxyz/)).toBeDefined();
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
