// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "./App.js";

// This project doesn't set vitest's `test.globals: true`, so RTL's
// auto-cleanup (which detects a global `afterEach`) never registers —
// same note as apps/extension/src/popup/Popup.test.tsx.
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

function stubMe(result: { user: unknown } | { error: string; status: number }) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL | Request) => {
      if (url.toString().includes("/providers")) return jsonResponse({ providers: [] });
      return "user" in result
        ? jsonResponse(result)
        : jsonResponse({ error: result.error }, result.status);
    }),
  );
}

describe("App", () => {
  it("renders the Ekusupo heading", () => {
    stubMe({ error: "not_authenticated", status: 401 });
    render(<App />);
    expect(screen.getByRole("heading", { name: "Ekusupo" })).toBeDefined();
  });

  it("shows the sign-in form when not authenticated", async () => {
    stubMe({ error: "not_authenticated", status: 401 });
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeDefined();
  });

  it("shows the signed-in user and a sign-out button when authenticated", async () => {
    stubMe({
      user: { id: "user-1", email: "user@example.com", createdAt: "2026-01-01T00:00:00.000Z" },
    });
    render(<App />);

    expect(await screen.findByText(/Signed in as user@example\.com/)).toBeDefined();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeDefined();
  });

  it("shows a message after a successful provider connect redirect", async () => {
    stubMe({
      user: { id: "user-1", email: "user@example.com", createdAt: "2026-01-01T00:00:00.000Z" },
    });
    window.history.replaceState(null, "", "/?connected=spotify");
    render(<App />);

    expect(await screen.findByText("Connected spotify.")).toBeDefined();
    window.history.replaceState(null, "", "/");
  });
});
