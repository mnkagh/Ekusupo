// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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
  it("renders the Ekusupo heading once the session check resolves", async () => {
    stubMe({ error: "not_authenticated", status: 401 });
    render(<App />);

    // Async because the heading lives in the view chosen by the session
    // check — while that is in flight the shell shows only a loading
    // state, so a synchronous query races it.
    expect(await screen.findByRole("heading", { name: "Ekusupo" })).toBeDefined();
  });

  it("offers both entry points instead of showing a form by default", async () => {
    stubMe({ error: "not_authenticated", status: 401 });
    render(<App />);

    await screen.findByRole("button", { name: "Create account" });
    const landing = within(document.querySelector(".landing") as HTMLElement);
    expect(landing.getByRole("button", { name: "Create account" })).toBeDefined();
    expect(landing.getByRole("button", { name: "Sign in" })).toBeDefined();
    // The drawer stays mounted so it can animate, but must be inert
    // and out of the accessibility tree until it is opened.
    expect(document.querySelector(".drawer--open")).toBeNull();
    expect(document.querySelector(".drawer__panel")?.hasAttribute("inert")).toBe(true);
  });

  it("opens the auth drawer on the side when an entry point is clicked", async () => {
    stubMe({ error: "not_authenticated", status: 401 });
    render(<App />);

    // Scoped to the landing: the drawer's own submit button is also
    // called "Sign in", so an unscoped query is ambiguous by design.
    await screen.findByRole("button", { name: "Create account" });
    const landing = within(document.querySelector(".landing") as HTMLElement);
    fireEvent.click(landing.getByRole("button", { name: "Create account" }));

    expect(await screen.findByRole("dialog", { name: "Account" })).toBeDefined();
    expect(document.querySelector(".drawer--open")).not.toBeNull();
    // "Create account" must open on the sign-up side, not on sign-in.
    expect(screen.getByRole("heading", { name: "Create an account" })).toBeDefined();
  });

  it("closes the drawer on Escape", async () => {
    stubMe({ error: "not_authenticated", status: 401 });
    render(<App />);

    await screen.findByRole("button", { name: "Create account" });
    const landing = within(document.querySelector(".landing") as HTMLElement);
    fireEvent.click(landing.getByRole("button", { name: "Sign in" }));
    expect(document.querySelector(".drawer--open")).not.toBeNull();

    act(() => {
      fireEvent.keyDown(document, { key: "Escape" });
    });
    expect(document.querySelector(".drawer--open")).toBeNull();
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

  it("explains a failed connect in plain language instead of showing the raw code", async () => {
    stubMe({
      user: { id: "user-1", email: "user@example.com", createdAt: "2026-01-01T00:00:00.000Z" },
    });
    // storage_failed specifically must not blame credentials: Spotify
    // authorized fine, the server just couldn't encrypt the token.
    window.history.replaceState(null, "", "/?provider_error=storage_failed");
    render(<App />);

    expect(await screen.findByText(/could not be saved/i)).toBeDefined();
    expect(screen.queryByText(/storage_failed/)).toBeNull();
    window.history.replaceState(null, "", "/");
  });

  it("falls back to the raw code for a provider error it doesn't recognize", async () => {
    stubMe({
      user: { id: "user-1", email: "user@example.com", createdAt: "2026-01-01T00:00:00.000Z" },
    });
    window.history.replaceState(null, "", "/?provider_error=something_new");
    render(<App />);

    expect(await screen.findByText("Could not connect: something_new")).toBeDefined();
    window.history.replaceState(null, "", "/");
  });
});
