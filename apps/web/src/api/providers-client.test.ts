import { describe, expect, it, vi } from "vitest";

import { createProvidersClient } from "./providers-client.js";
import { ApiError } from "./errors.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("createProvidersClient", () => {
  it("listProviders sends credentials: include and returns the list", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(init?.credentials).toBe("include");
      return jsonResponse({ providers: [{ provider: "spotify", connectedAt: "2026-01-01" }] });
    }) as unknown as typeof fetch;

    const client = createProvidersClient({ baseUrl: "https://api.example.com", fetchImpl });
    const result = await client.listProviders();

    expect(result.providers).toEqual([{ provider: "spotify", connectedAt: "2026-01-01" }]);
  });

  it("disconnectProvider DELETEs the right path", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(url.toString()).toBe("https://api.example.com/providers/spotify");
      expect(init?.method).toBe("DELETE");
      return jsonResponse({ disconnected: true });
    }) as unknown as typeof fetch;

    const client = createProvidersClient({ baseUrl: "https://api.example.com", fetchImpl });
    await expect(client.disconnectProvider("spotify")).resolves.toEqual({ disconnected: true });
  });

  it("throws ApiError with the server's message on failure", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ error: "not_authenticated" }, 401),
    ) as unknown as typeof fetch;

    const client = createProvidersClient({ baseUrl: "https://api.example.com", fetchImpl });
    await expect(client.listProviders()).rejects.toBeInstanceOf(ApiError);
  });

  it("getConnectUrl returns a real navigable URL, not something to fetch", () => {
    const client = createProvidersClient({ baseUrl: "https://api.example.com" });
    expect(client.getConnectUrl("spotify")).toBe(
      "https://api.example.com/providers/spotify/connect",
    );
  });

  it("escapes the provider id so a crafted value cannot alter the path", () => {
    const client = createProvidersClient({ baseUrl: "https://api.example.com" });
    expect(client.getConnectUrl("../admin")).toBe(
      "https://api.example.com/providers/..%2Fadmin/connect",
    );
  });
});
