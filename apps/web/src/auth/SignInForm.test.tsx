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
