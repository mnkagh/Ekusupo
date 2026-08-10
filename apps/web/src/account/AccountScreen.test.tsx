// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AccountScreen } from "./AccountScreen.js";

afterEach(cleanup);
afterEach(() => vi.unstubAllGlobals());

const user = { id: "u1", email: "someone@example.com", createdAt: "2026-01-01T00:00:00.000Z" };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function stubApi(response: { body: unknown; status?: number } = { body: {} }) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => jsonResponse(response.body, response.status ?? 200)),
  );
}

function calls(): [string, RequestInit][] {
  return (globalThis.fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls;
}

function fillPassword(current: string, next: string): void {
  fireEvent.change(screen.getByLabelText("Current password"), { target: { value: current } });
  fireEvent.change(screen.getByLabelText("New password"), { target: { value: next } });
}

describe("AccountScreen — password", () => {
  it("cannot submit until both fields are filled", () => {
    stubApi();
    render(<AccountScreen user={user} onDeleted={() => {}} />);

    const button = screen.getByRole("button", { name: "Change password" });
    expect(button.hasAttribute("disabled")).toBe(true);

    fillPassword("old password", "");
    expect(button.hasAttribute("disabled")).toBe(true);

    fillPassword("old password", "new password");
    expect(button.hasAttribute("disabled")).toBe(false);
  });

  it("sends both passwords and confirms other devices were signed out", async () => {
    stubApi({ body: { changed: true } });
    render(<AccountScreen user={user} onDeleted={() => {}} />);

    fillPassword("old password", "a whole new thing");
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));

    await waitFor(() => {
      expect(JSON.parse(calls()[0]?.[1].body as string)).toEqual({
        currentPassword: "old password",
        newPassword: "a whole new thing",
      });
    });

    // The consequence is stated, not left to be discovered on another
    // device — CLAUDE.md §20.2.
    expect(await screen.findByRole("status")).toHaveProperty(
      "textContent",
      "Password changed. Your other devices have been signed out.",
    );
  });

  it("shows the server's own refusal rather than a generic failure", async () => {
    stubApi({ status: 400, body: { error: "That is not your current password." } });
    render(<AccountScreen user={user} onDeleted={() => {}} />);

    fillPassword("wrong", "a whole new thing");
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));

    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "That is not your current password.",
    );
  });
});

describe("AccountScreen — data export", () => {
  it("offers a download and says what is deliberately left out of it", () => {
    stubApi();
    render(<AccountScreen user={user} onDeleted={() => {}} />);

    const link = screen.getByRole("link", { name: "Download my data" });
    expect(link.getAttribute("href")).toContain("/account/export");
    expect(link.hasAttribute("download")).toBe(true);
    // Honesty about the omission matters more than the omission itself.
    expect(screen.getByText(/Provider access tokens are excluded/i)).toBeDefined();
  });
});

describe("AccountScreen — deletion", () => {
  it("does not delete on a single click", () => {
    stubApi();
    render(<AccountScreen user={user} onDeleted={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "Delete my account" }));

    expect(calls()).toHaveLength(0);
    expect(screen.getByLabelText("Your password")).toBeDefined();
    expect(screen.getByLabelText("Type DELETE to confirm")).toBeDefined();
  });

  it("stays disabled until the password and the exact word are both given", () => {
    stubApi();
    render(<AccountScreen user={user} onDeleted={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete my account" }));

    const confirm = screen.getByRole("button", { name: "Delete permanently" });
    expect(confirm.hasAttribute("disabled")).toBe(true);

    fireEvent.change(screen.getByLabelText("Your password"), { target: { value: "hunter2" } });
    expect(confirm.hasAttribute("disabled")).toBe(true);

    // Case matters: "delete" is not the confirmation, and the API agrees.
    fireEvent.change(screen.getByLabelText("Type DELETE to confirm"), {
      target: { value: "delete" },
    });
    expect(confirm.hasAttribute("disabled")).toBe(true);

    fireEvent.change(screen.getByLabelText("Type DELETE to confirm"), {
      target: { value: "DELETE" },
    });
    expect(confirm.hasAttribute("disabled")).toBe(false);
  });

  it("cancelling puts everything back and sends nothing", () => {
    stubApi();
    render(<AccountScreen user={user} onDeleted={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "Delete my account" }));
    fireEvent.change(screen.getByLabelText("Your password"), { target: { value: "hunter2" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByRole("button", { name: "Delete my account" })).toBeDefined();
    expect(calls()).toHaveLength(0);
  });

  it("deletes and tells the shell, once both are given", async () => {
    stubApi({ body: { deleted: true } });
    const onDeleted = vi.fn();
    render(<AccountScreen user={user} onDeleted={onDeleted} />);

    fireEvent.click(screen.getByRole("button", { name: "Delete my account" }));
    fireEvent.change(screen.getByLabelText("Your password"), { target: { value: "hunter2" } });
    fireEvent.change(screen.getByLabelText("Type DELETE to confirm"), {
      target: { value: "DELETE" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Delete permanently" }));

    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));

    const [url, init] = calls()[0] ?? [];
    expect(url).toContain("/account");
    expect(init?.method).toBe("DELETE");
    expect(JSON.parse(init?.body as string)).toEqual({ password: "hunter2", confirm: "DELETE" });
  });

  it("keeps the user on the screen when deletion is refused", async () => {
    stubApi({ status: 400, body: { error: "That is not your password." } });
    const onDeleted = vi.fn();
    render(<AccountScreen user={user} onDeleted={onDeleted} />);

    fireEvent.click(screen.getByRole("button", { name: "Delete my account" }));
    fireEvent.change(screen.getByLabelText("Your password"), { target: { value: "wrong" } });
    fireEvent.change(screen.getByLabelText("Type DELETE to confirm"), {
      target: { value: "DELETE" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Delete permanently" }));

    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "That is not your password.",
    );
    expect(onDeleted).not.toHaveBeenCalled();
  });
});
