// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TransferScreen } from "./TransferScreen.js";

afterEach(cleanup);
afterEach(() => vi.unstubAllGlobals());

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const emptyReport = {
  sourceProvider: "spotify",
  destinationProvider: "spotify",
  itemType: "playlist",
  totalItems: 0,
  matchedItems: 0,
  createdItems: 0,
  skippedItems: 0,
  failedItems: 0,
  lowConfidenceMatches: [],
  unavailableItems: [],
  providerLimitationsEncountered: [],
  userActionsRequired: [],
};

/** Routes the two endpoints this screen uses; `dryRun` decides the POST response. */
function stubApi(dryRun: { body: unknown; status?: number }, transfers: unknown[] = []) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (init?.method === "POST") return jsonResponse(dryRun.body, dryRun.status ?? 200);
      if (url.toString().includes("/transfers")) return jsonResponse({ transfers });
      return jsonResponse({});
    }),
  );
}

describe("TransferScreen", () => {
  it("says up front that nothing will be modified", async () => {
    stubApi({ body: {} });
    render(<TransferScreen />);

    // CLAUDE.md §20.2: show what will happen before it happens.
    expect(await screen.findByText(/nothing is modified/i)).toBeDefined();
  });

  it("cannot submit an empty link", async () => {
    stubApi({ body: {} });
    render(<TransferScreen />);

    const button = await screen.findByRole("button", { name: "Preview transfer" });
    expect(button.hasAttribute("disabled")).toBe(true);
  });

  it("extracts the id from a pasted share URL before calling the API", async () => {
    stubApi({ body: { job: { id: "t1", status: "partial" }, report: emptyReport } });
    render(<TransferScreen />);

    fireEvent.change(await screen.findByLabelText("Playlist link"), {
      target: { value: "https://open.spotify.com/playlist/abc123?si=xyz" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview transfer" }));

    await waitFor(() => {
      const post = (
        globalThis.fetch as unknown as { mock: { calls: [string, RequestInit][] } }
      ).mock.calls.find((call) => call[1]?.method === "POST");
      // The share token must be stripped — sending it 404s.
      expect(JSON.parse(post?.[1].body as string)).toEqual({ sourcePlaylistId: "abc123" });
    });
  });

  it("shows the report when a run finishes", async () => {
    stubApi({
      body: {
        job: { id: "t1", status: "partial" },
        report: {
          ...emptyReport,
          totalItems: 12,
          skippedItems: 12,
          providerLimitationsEncountered: ["Destination provider cannot search tracks"],
        },
      },
    });
    render(<TransferScreen />);

    fireEvent.change(await screen.findByLabelText("Playlist link"), {
      target: { value: "abc123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview transfer" }));

    expect(await screen.findByText("Finished with gaps")).toBeDefined();

    // Scoped to each labelled count: "12" appears twice here (total and
    // skipped), so an unscoped text query is ambiguous — and asserting
    // the pairing is the point anyway.
    const tracks = screen.getByText("Tracks").closest(".report__count") as HTMLElement;
    expect(within(tracks).getByText("12")).toBeDefined();
    const skipped = screen.getByText("Skipped").closest(".report__count") as HTMLElement;
    expect(within(skipped).getByText("12")).toBeDefined();

    expect(screen.getByText(/cannot search tracks/)).toBeDefined();
  });

  it("reports a failed run as a failure, not as a finished empty transfer", async () => {
    stubApi({
      body: {
        job: { id: "t1", status: "failed" },
        report: {
          ...emptyReport,
          failureReason: "Could not read the source playlist: playlist not found",
        },
      },
    });
    render(<TransferScreen />);

    fireEvent.change(await screen.findByLabelText("Playlist link"), {
      target: { value: "nope" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview transfer" }));

    // All counters are zero here, exactly like a successful transfer of
    // an empty playlist — the status is the only thing telling them apart.
    expect(await screen.findByText("Did not finish")).toBeDefined();
    expect(screen.getByText(/playlist not found/)).toBeDefined();
  });

  it("surfaces the server's own message when the API refuses", async () => {
    stubApi({ body: { error: "Connect Spotify before starting a transfer." }, status: 400 });
    render(<TransferScreen />);

    fireEvent.change(await screen.findByLabelText("Playlist link"), {
      target: { value: "abc123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview transfer" }));

    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "Connect Spotify before starting a transfer.",
    );
  });

  it("lists recent transfers", async () => {
    stubApi({ body: {} }, [
      {
        id: "t1",
        status: "partial",
        sourcePlaylistId: "abc123",
        createdAt: "2026-08-10T10:00:00.000Z",
      },
    ]);
    render(<TransferScreen />);

    expect(await screen.findByText("abc123")).toBeDefined();
  });

  it("keeps working when the history request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
        if (init?.method === "POST") return jsonResponse({});
        return jsonResponse({ error: "boom" }, 500);
      }),
    );
    render(<TransferScreen />);

    // The form is the point of the screen; a broken history list must
    // not take it down with it.
    expect(await screen.findByLabelText("Playlist link")).toBeDefined();
  });
});
