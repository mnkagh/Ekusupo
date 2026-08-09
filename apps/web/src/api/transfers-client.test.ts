import { describe, expect, it, vi } from "vitest";

import { ApiError } from "./errors.js";
import { createTransfersClient, extractPlaylistId } from "./transfers-client.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("extractPlaylistId", () => {
  it("takes the id out of a share URL, dropping the tracking query", () => {
    expect(
      extractPlaylistId("https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=abc123"),
    ).toBe("37i9dQZF1DXcBWIGoYBM5M");
  });

  it("accepts the spotify: URI form", () => {
    expect(extractPlaylistId("spotify:playlist:37i9dQZF1DXcBWIGoYBM5M")).toBe(
      "37i9dQZF1DXcBWIGoYBM5M",
    );
  });

  it("passes a bare id straight through", () => {
    expect(extractPlaylistId("37i9dQZF1DXcBWIGoYBM5M")).toBe("37i9dQZF1DXcBWIGoYBM5M");
  });

  it("trims incidental whitespace from a paste", () => {
    expect(extractPlaylistId("  37i9dQZF1DXcBWIGoYBM5M \n")).toBe("37i9dQZF1DXcBWIGoYBM5M");
  });

  it("returns empty for empty input rather than a stray fragment", () => {
    expect(extractPlaylistId("   ")).toBe("");
  });

  it("hands unrecognised input through instead of guessing", () => {
    // Better to let the API say "not found" than to silently mangle
    // something that might be a valid id in a form we don't know.
    expect(extractPlaylistId("not-a-link")).toBe("not-a-link");
  });
});

describe("createTransfersClient", () => {
  it("posts the playlist id and sends cookies", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ job: { id: "t1" }, report: {} }));
    const client = createTransfersClient({
      baseUrl: "http://api.test",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await client.dryRun("playlist-1");

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://api.test/transfers/dry-run");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ sourcePlaylistId: "playlist-1" });
    // Without this the session cookie never reaches the API and every
    // call 401s.
    expect(init.credentials).toBe("include");
  });

  it("resolves for a failed transfer — the request worked, the transfer didn't", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        job: { id: "t1", status: "failed" },
        report: { failureReason: "Could not read the source playlist: not found" },
      }),
    );
    const client = createTransfersClient({
      baseUrl: "http://api.test",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await client.dryRun("missing");

    expect(result.job.status).toBe("failed");
    expect(result.report.failureReason).toContain("Could not read");
  });

  it("raises ApiError with the server's message on a real failure", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ error: "Connect Spotify before starting a transfer." }, 400),
    );
    const client = createTransfersClient({
      baseUrl: "http://api.test",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(client.dryRun("x")).rejects.toBeInstanceOf(ApiError);
    await expect(client.dryRun("x")).rejects.toThrow(/Connect Spotify/);
  });

  it("lists transfers", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ transfers: [{ id: "t1" }] }));
    const client = createTransfersClient({
      baseUrl: "http://api.test",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const { transfers } = await client.listTransfers();

    expect(transfers).toHaveLength(1);
    expect((fetchImpl.mock.calls[0] as unknown as [string])[0]).toBe("http://api.test/transfers");
  });
});
