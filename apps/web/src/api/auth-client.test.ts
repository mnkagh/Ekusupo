import { describe, expect, it, vi } from "vitest";

import { createAuthClient } from "./auth-client.js";
import { ApiError } from "./errors.js";

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

describe("createAuthClient", () => {
  it("sends credentials: include on every request", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(init?.credentials).toBe("include");
      return jsonResponse({ user: userFixture });
    }) as unknown as typeof fetch;

    const client = createAuthClient({ baseUrl: "https://api.example.com", fetchImpl });
    await client.signIn("user@example.com", "password");

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.example.com/auth/sign-in",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("signUp resolves with the created user", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ user: userFixture }, 201),
    ) as unknown as typeof fetch;
    const client = createAuthClient({ baseUrl: "https://api.example.com", fetchImpl });

    const result = await client.signUp("user@example.com", "password");
    expect(result.user.email).toBe("user@example.com");
  });

  it("throws an ApiError with the server's message on a non-2xx response", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ error: "Incorrect email or password." }, 401),
    ) as unknown as typeof fetch;
    const client = createAuthClient({ baseUrl: "https://api.example.com", fetchImpl });

    await expect(client.signIn("user@example.com", "wrong")).rejects.toMatchObject({
      message: "Incorrect email or password.",
      status: 401,
    });
  });

  describe("getMe", () => {
    it("resolves with the user when signed in", async () => {
      const fetchImpl = vi.fn(async () =>
        jsonResponse({ user: userFixture }),
      ) as unknown as typeof fetch;
      const client = createAuthClient({ baseUrl: "https://api.example.com", fetchImpl });

      await expect(client.getMe()).resolves.toEqual(userFixture);
    });

    it("resolves with undefined (not a thrown error) when not signed in", async () => {
      const fetchImpl = vi.fn(async () =>
        jsonResponse({ error: "not_authenticated" }, 401),
      ) as unknown as typeof fetch;
      const client = createAuthClient({ baseUrl: "https://api.example.com", fetchImpl });

      await expect(client.getMe()).resolves.toBeUndefined();
    });

    it("still throws for a real server error, not just 401", async () => {
      const fetchImpl = vi.fn(async () =>
        jsonResponse({ error: "internal error" }, 500),
      ) as unknown as typeof fetch;
      const client = createAuthClient({ baseUrl: "https://api.example.com", fetchImpl });

      await expect(client.getMe()).rejects.toBeInstanceOf(ApiError);
    });
  });
});
