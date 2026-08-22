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

interface StubOptions {
  /** Rejection of the *start* request. Omit for a job that starts fine. */
  startError?: { body: unknown; status: number };
  /** What polling reports. Omit to leave the job running. */
  finished?: Record<string, unknown>;
  transfers?: unknown[];
  catalog?: unknown[];
  /** Rejection of `DELETE /transfers/:id`. Omit for a delete that works. */
  deleteError?: { body: unknown; status: number };
}

const STARTED_JOB = { id: "t1", status: "pending", dryRun: true };

/**
 * Models the real contract: starting a transfer answers **202** with a
 * pending job, and the outcome only appears once the client polls
 * `GET /transfers/:id` (ADR-0033). A stub that returned the finished
 * report straight from the POST would let a component that never polls
 * pass this suite.
 */
function stubApi({
  startError,
  finished,
  transfers = [],
  catalog = [],
  deleteError,
}: StubOptions = {}) {
  // Mutable, so a delete actually removes the row the way the server
  // would — a stub that kept returning the deleted job would let a
  // component that never refreshes its history pass.
  const remaining = [...transfers];

  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const href = url.toString();

      if (init?.method === "DELETE") {
        if (deleteError) return jsonResponse(deleteError.body, deleteError.status);
        const id = href.split("/").pop();
        const index = remaining.findIndex((job) => (job as { id?: string }).id === id);
        if (index >= 0) remaining.splice(index, 1);
        return jsonResponse({ deleted: true });
      }

      if (init?.method === "POST") {
        if (href.includes("/cancel")) return jsonResponse({ cancelled: true });
        if (startError) return jsonResponse(startError.body, startError.status);
        return jsonResponse({ job: STARTED_JOB, pollUrl: "/transfers/t1" }, 202);
      }

      if (href.includes("/providers/catalog")) return jsonResponse({ providers: catalog });
      if (/\/transfers\/[^/]+$/.test(href)) {
        return jsonResponse({ transfer: finished ?? { ...STARTED_JOB, status: "running" } });
      }
      if (href.includes("/transfers")) return jsonResponse({ transfers: remaining });
      return jsonResponse({});
    }),
  );
}

function postCalls(): [string, RequestInit][] {
  return (
    globalThis.fetch as unknown as { mock: { calls: [string, RequestInit][] } }
  ).mock.calls.filter((call) => call[1]?.method === "POST");
}

async function typeLink(value: string): Promise<void> {
  fireEvent.change(await screen.findByLabelText("Playlist link"), { target: { value } });
}

describe("TransferScreen", () => {
  it("says up front that nothing is written without confirmation", async () => {
    stubApi();
    render(<TransferScreen />);

    // CLAUDE.md §20.2: show what will happen before it happens.
    expect(await screen.findByText(/nothing is written until you confirm/i)).toBeDefined();
  });

  it("cannot run anything with an empty link", async () => {
    stubApi();
    render(<TransferScreen />);

    expect((await screen.findByRole("button", { name: "Preview" })).hasAttribute("disabled")).toBe(
      true,
    );
    expect(screen.getByRole("button", { name: "Transfer" }).hasAttribute("disabled")).toBe(true);
  });

  it("extracts the id from a pasted share URL before calling the API", async () => {
    stubApi({ finished: { ...STARTED_JOB, status: "partial", report: emptyReport } });
    render(<TransferScreen />);

    await typeLink("https://open.spotify.com/playlist/abc123?si=xyz");
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));

    await waitFor(() => {
      // The share token must be stripped — sending it 404s.
      expect(JSON.parse(postCalls()[0]?.[1].body as string)).toEqual({
        sourcePlaylistId: "abc123",
      });
    });
  });

  it("reads the playlist from a YouTube link's list parameter and names its source", async () => {
    stubApi({ finished: { ...STARTED_JOB, status: "partial", report: emptyReport } });
    render(<TransferScreen />);

    fireEvent.change(await screen.findByLabelText("From"), {
      target: { value: "youtube-music" },
    });
    await typeLink("https://music.youtube.com/playlist?list=PLabc_123&si=whatever");
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));

    await waitFor(() => {
      expect(JSON.parse(postCalls()[0]?.[1].body as string)).toEqual({
        sourcePlaylistId: "PLabc_123",
        sourceProvider: "youtube-music",
      });
    });
  });

  it("does not send a source for Spotify, which is the server's default", async () => {
    stubApi();
    render(<TransferScreen />);

    fireEvent.change(await screen.findByLabelText("From"), { target: { value: "spotify" } });
    await typeLink("abc123");
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));

    await waitFor(() => {
      expect(JSON.parse(postCalls()[0]?.[1].body as string)).toEqual({
        sourcePlaylistId: "abc123",
      });
    });
  });

  it("shows the report when a run finishes", async () => {
    stubApi({
      finished: {
        ...STARTED_JOB,
        status: "partial",
        report: {
          ...emptyReport,
          totalItems: 12,
          skippedItems: 12,
          providerLimitationsEncountered: ["Destination provider cannot search tracks"],
        },
      },
    });
    render(<TransferScreen />);

    await typeLink("abc123");
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));

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
      finished: {
        ...STARTED_JOB,
        status: "failed",
        report: {
          ...emptyReport,
          failureReason: "Could not read the source playlist: playlist not found",
        },
      },
    });
    render(<TransferScreen />);

    await typeLink("nope");
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));

    // All counters are zero here, exactly like a successful transfer of
    // an empty playlist — the status is the only thing telling them apart.
    expect(await screen.findByText("Did not finish")).toBeDefined();
    expect(screen.getByText(/playlist not found/)).toBeDefined();
  });

  it("surfaces the server's own message when the API refuses", async () => {
    stubApi({
      startError: { body: { error: "Connect Spotify before starting a transfer." }, status: 400 },
    });
    render(<TransferScreen />);

    await typeLink("abc123");
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));

    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "Connect Spotify before starting a transfer.",
    );
  });

  it("lists recent transfers", async () => {
    stubApi({
      transfers: [
        {
          id: "t1",
          status: "partial",
          sourcePlaylistId: "abc123",
          createdAt: "2026-08-10T10:00:00.000Z",
        },
      ],
    });
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

describe("TransferScreen — writing for real", () => {
  it("does not write until the confirmation is accepted", async () => {
    stubApi({ finished: { ...STARTED_JOB, status: "completed", report: emptyReport } });
    render(<TransferScreen />);

    await typeLink("abc123");
    fireEvent.click(screen.getByRole("button", { name: "Transfer" }));

    // The dialog is up and nothing has been sent (CLAUDE.md §9.3).
    const dialog = await screen.findByRole("alertdialog");
    expect(postCalls()).toHaveLength(0);
    expect(within(dialog).getByText(/really write to/i)).toBeDefined();

    fireEvent.click(within(dialog).getByRole("button", { name: "Yes, transfer it" }));

    await waitFor(() => {
      expect(JSON.parse(postCalls()[0]?.[1].body as string)).toEqual({
        sourcePlaylistId: "abc123",
        destinationProvider: "upf",
        confirm: true,
      });
    });
  });

  it("cancelling the confirmation writes nothing", async () => {
    stubApi();
    render(<TransferScreen />);

    await typeLink("abc123");
    fireEvent.click(screen.getByRole("button", { name: "Transfer" }));
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(postCalls()).toHaveLength(0);
  });

  it("names the chosen destination in the confirmation", async () => {
    stubApi({
      catalog: [
        { id: "youtube-music", displayName: "YouTube Music", authKind: "oauth2", configured: true },
      ],
    });
    render(<TransferScreen />);

    await typeLink("abc123");
    fireEvent.change(await screen.findByLabelText("Send it to"), {
      target: { value: "youtube-music" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Transfer" }));

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog.textContent).toContain("YouTube Music");
  });

  it("offers only destinations the server says are configured", async () => {
    stubApi({
      catalog: [
        { id: "youtube-music", displayName: "YouTube Music", authKind: "oauth2", configured: true },
        { id: "spotify", displayName: "Spotify", authKind: "oauth2", configured: false },
      ],
    });
    render(<TransferScreen />);

    const select = await screen.findByLabelText("Send it to");
    await waitFor(() => {
      expect(within(select).getByText("YouTube Music")).toBeDefined();
    });
    // Offering a provider the server cannot construct would only produce
    // a rejection after the click.
    expect(within(select).queryByText("Spotify")).toBeNull();
    // Always present, needs nothing connected.
    expect(within(select).getByText("A UPF file (download)")).toBeDefined();
  });

  it("offers the exported file for download when one was produced", async () => {
    stubApi({
      finished: {
        ...STARTED_JOB,
        status: "completed",
        hasUpfDocument: true,
        report: { ...emptyReport, createdItems: 2, totalItems: 2 },
      },
    });
    render(<TransferScreen />);

    await typeLink("abc123");
    fireEvent.click(screen.getByRole("button", { name: "Transfer" }));
    fireEvent.click(await screen.findByRole("button", { name: "Yes, transfer it" }));

    const link = await screen.findByRole("link", { name: "Download UPF file" });
    expect(link.getAttribute("href")).toContain("/transfers/t1/upf");
    expect(link.getAttribute("download")).toBe("t1.upf.json");
  });

  it("shows live progress while the transfer is still running", async () => {
    // No `finished`, so polling keeps reporting a running job — which is
    // exactly the state a long transfer spends its time in.
    stubApi({
      finished: {
        ...STARTED_JOB,
        status: "running",
        progress: { step: "matching", processed: 40, total: 120 },
      },
    });
    render(<TransferScreen />);

    await typeLink("abc123");
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));

    const bar = await screen.findByRole("progressbar", { name: "Transfer progress" });
    expect(bar.getAttribute("aria-valuenow")).toBe("33");
    expect(screen.getByText(/Finding each track/)).toBeDefined();
    expect(screen.getByText(/40 of 120/)).toBeDefined();
  });

  it("offers to cancel a running transfer, and says so to the server", async () => {
    stubApi({ finished: { ...STARTED_JOB, status: "running" } });
    render(<TransferScreen />);

    await typeLink("abc123");
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));

    const cancel = await screen.findByRole("button", { name: "Cancel" });
    fireEvent.click(cancel);

    await waitFor(() => {
      expect(postCalls().some((call) => call[0].includes("/transfers/t1/cancel"))).toBe(true);
    });
  });

  it("says the work continues without the tab open", async () => {
    stubApi({ finished: { ...STARTED_JOB, status: "running" } });
    render(<TransferScreen />);

    await typeLink("abc123");
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));

    // A background job the user does not know is a background job looks
    // like one they must babysit.
    expect(await screen.findByText(/keeps running if you close the tab/i)).toBeDefined();
  });

  it("offers a download beside an older transfer that produced one", async () => {
    stubApi({
      transfers: [
        {
          id: "t9",
          status: "completed",
          sourcePlaylistId: "abc123",
          createdAt: "2026-08-10T10:00:00.000Z",
          hasUpfDocument: true,
        },
        {
          id: "t8",
          status: "partial",
          sourcePlaylistId: "def456",
          createdAt: "2026-08-09T10:00:00.000Z",
        },
      ],
    });
    render(<TransferScreen />);

    const downloads = await screen.findAllByRole("link", { name: "Download" });
    expect(downloads).toHaveLength(1);
    expect(downloads[0]?.getAttribute("href")).toContain("/transfers/t9/upf");
  });
});

describe("deleting a run from history", () => {
  const finishedRun = {
    id: "old-1",
    status: "completed",
    dryRun: true,
    sourcePlaylistId: "playlist-9",
    createdAt: "2026-01-01T00:00:00.000Z",
    hasUpfDocument: true,
  };

  it("takes two clicks, because it also destroys the UPF export", async () => {
    // CLAUDE.md §9.3: confirmation before a destructive action. One
    // stray click on the smallest control on the screen must not throw
    // away the only copy of someone's exported library.
    stubApi({ transfers: [finishedRun] });
    render(<TransferScreen />);

    const remove = await screen.findByRole("button", {
      name: /^Delete the transfer of playlist-9$/,
    });
    fireEvent.click(remove);

    expect(
      (globalThis.fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls.some(
        (call) => call[1]?.method === "DELETE",
      ),
    ).toBe(false);
    expect(await screen.findByRole("button", { name: /^Confirm deleting/ })).toBeDefined();
  });

  it("removes the run once confirmed", async () => {
    stubApi({ transfers: [finishedRun] });
    render(<TransferScreen />);

    fireEvent.click(
      await screen.findByRole("button", { name: /^Delete the transfer of playlist-9$/ }),
    );
    fireEvent.click(await screen.findByRole("button", { name: /^Confirm deleting/ }));

    await waitFor(() => {
      expect(screen.queryByText("playlist-9")).toBeNull();
    });
  });

  it("explains a refusal instead of silently leaving the row there", async () => {
    // The API refuses to delete a transfer that is still running.
    stubApi({
      transfers: [finishedRun],
      deleteError: {
        body: { error: "That transfer is still running. Cancel it before deleting it." },
        status: 409,
      },
    });
    render(<TransferScreen />);

    fireEvent.click(
      await screen.findByRole("button", { name: /^Delete the transfer of playlist-9$/ }),
    );
    fireEvent.click(await screen.findByRole("button", { name: /^Confirm deleting/ }));

    expect(await screen.findByRole("alert")).toBeDefined();
    expect(await screen.findByText(/still running. Cancel it before deleting it/)).toBeDefined();
    // And the run is still listed — a failed delete must not look like a
    // successful one.
    expect(screen.getByText("playlist-9")).toBeDefined();
  });
});
