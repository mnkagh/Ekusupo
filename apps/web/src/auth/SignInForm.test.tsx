// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SignInForm } from "./SignInForm.js";

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

const userFixture = {
  id: "user-1",
  email: "user@example.com",
  createdAt: "2026-01-01T00:00:00.000Z",
};

function fillAndSubmit(email: string, password: string, buttonName: string) {
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: email } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: password } });
  fireEvent.click(screen.getByRole("button", { name: buttonName }));
}

describe("SignInForm", () => {
  it("signs in and calls onSignedIn with the returned user", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request) => {
        expect(url.toString()).toContain("/auth/sign-in");
        return jsonResponse({ user: userFixture });
      }),
    );
    const onSignedIn = vi.fn();
    render(<SignInForm onSignedIn={onSignedIn} />);

    fillAndSubmit("user@example.com", "correct horse battery", "Sign in");

    await vi.waitFor(() => expect(onSignedIn).toHaveBeenCalledWith(userFixture));
  });

  it("shows the server's error message on failure, without calling onSignedIn", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ error: "Incorrect email or password." }, 401)),
    );
    const onSignedIn = vi.fn();
    render(<SignInForm onSignedIn={onSignedIn} />);

    fillAndSubmit("user@example.com", "wrong password", "Sign in");

    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "Incorrect email or password.",
    );
    expect(onSignedIn).not.toHaveBeenCalled();
  });

  it("switches to sign-up mode and posts to /auth/sign-up instead", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request) => {
        expect(url.toString()).toContain("/auth/sign-up");
        return jsonResponse({ user: userFixture }, 201);
      }),
    );
    const onSignedIn = vi.fn();
    render(<SignInForm onSignedIn={onSignedIn} />);

    fireEvent.click(screen.getByRole("button", { name: "Need an account? Sign up" }));
    fillAndSubmit("new@example.com", "correct horse battery", "Sign up");

    await vi.waitFor(() => expect(onSignedIn).toHaveBeenCalledWith(userFixture));
  });
});

describe("after a successful sign-in", () => {
  it("leaves the submit button usable, because the form is reused rather than remounted", async () => {
    // The drawer keeps this form mounted while closed. Signing in, then
    // out, then reopening the drawer returns to this same instance — and
    // a form still stuck on "submitting" reopened with a disabled button
    // and a not-allowed cursor, with no way to sign in again short of
    // reloading the page.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ user: userFixture })),
    );
    const onSignedIn = vi.fn();
    render(<SignInForm onSignedIn={onSignedIn} />);

    fillAndSubmit("user@example.com", "correct horse battery", "Sign in");
    await vi.waitFor(() => expect(onSignedIn).toHaveBeenCalled());

    const submit = screen.getByRole("button", { name: "Sign in" });
    expect(submit.hasAttribute("disabled")).toBe(false);
  });

  it("does not keep the password in memory once it has been exchanged", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ user: userFixture })),
    );
    const onSignedIn = vi.fn();
    render(<SignInForm onSignedIn={onSignedIn} />);

    fillAndSubmit("user@example.com", "correct horse battery", "Sign in");
    await vi.waitFor(() => expect(onSignedIn).toHaveBeenCalled());

    expect((screen.getByLabelText("Password") as HTMLInputElement).value).toBe("");
  });
});
