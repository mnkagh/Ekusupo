// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { UpfScreen } from "./UpfScreen.js";

afterEach(cleanup);
afterEach(() => vi.unstubAllGlobals());

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const emptyReport = {
  sourceProvider: "upf-file",
  destinationProvider: "upf-file",
  itemType: "playlist",
  totalItems: 2,
  matchedItems: 0,
  createdItems: 2,
  skippedItems: 0,
  failedItems: 0,
  lowConfidenceMatches: [],
  unavailableItems: [],
  providerLimitationsEncountered: [],
  userActionsRequired: [],
};

function validDocument(playlists = 1) {
  return {
    format: "upf",
    version: "0.1.0",
    createdAt: "2026-01-01T00:00:00.000Z",
    playlists: Array.from({ length: playlists }, (_, index) => ({
      id: `p${index + 1}`,
      title: `Playlist ${index + 1}`,
      items: [{ track: { id: "t1", title: "Mr. Brightside", artists: [] } }],
    })),
  };
}

interface StubOptions {
  importResponse?: { body: unknown; status?: number };
  transfers?: unknown[];
  catalog?: unknown[];
}

function stubApi({ importResponse, transfers = [], catalog = [] }: StubOptions = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (init?.method === "POST") {
        return jsonResponse(importResponse?.body ?? {}, importResponse?.status ?? 200);
      }
      if (url.toString().includes("/providers/catalog"))
        return jsonResponse({ providers: catalog });
      if (url.toString().includes("/transfers")) return jsonResponse({ transfers });
      return jsonResponse({});
    }),
  );
}

function postCalls(): [string, RequestInit][] {
  return (
    globalThis.fetch as unknown as { mock: { calls: [string, RequestInit][] } }
  ).mock.calls.filter((call) => call[1]?.method === "POST");
}

/**
 * jsdom's File does not implement `.text()`, so the component's read
 * would reject on a real one. Overriding the property is closer to the
 * browser than stubbing the component's own logic away.
 */
function upload(name: string, contents: string): void {
  const file = new File([contents], name, { type: "application/json" });
  Object.defineProperty(file, "text", { value: async () => contents });

  const input = screen.getByLabelText("UPF file") as HTMLInputElement;
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  fireEvent.change(input);
}

describe("UpfScreen", () => {
  it("explains what a UPF file is before asking for one", async () => {
    stubApi();
    render(<UpfScreen />);

    expect(await screen.findByText(/plain, readable record of a playlist/i)).toBeDefined();
  });

  it("rejects a file that is not JSON without calling the API", async () => {
    stubApi();
    render(<UpfScreen />);

    upload("notes.txt", "this is not json");

    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      expect.stringContaining("not valid JSON") as unknown as string,
    );
    expect(postCalls()).toHaveLength(0);
  });

  it("summarises a loaded file before importing it", async () => {
    stubApi();
    render(<UpfScreen />);

    upload("backup.upf.json", JSON.stringify(validDocument(3)));

    expect(await screen.findByText("backup.upf.json")).toBeDefined();
    expect(screen.getByText(/3 playlists/)).toBeDefined();
    // Nothing sent yet — loading a file is not importing it.
    expect(postCalls()).toHaveLength(0);
  });

  it("does not ask which playlist when there is only one", async () => {
    stubApi();
    render(<UpfScreen />);

    upload("backup.upf.json", JSON.stringify(validDocument(1)));

    await screen.findByText("backup.upf.json");
    expect(screen.queryByLabelText("Which playlist")).toBeNull();
  });

  it("imports the chosen playlist to the chosen destination", async () => {
    stubApi({
      importResponse: { body: { job: { id: "t1", status: "completed" }, report: emptyReport } },
    });
    render(<UpfScreen />);

    const document = validDocument(2);
    upload("backup.upf.json", JSON.stringify(document));

    fireEvent.change(await screen.findByLabelText("Which playlist"), { target: { value: "p2" } });
    fireEvent.click(screen.getByRole("button", { name: "Import" }));

    await waitFor(() => {
      expect(JSON.parse(postCalls()[0]?.[1].body as string)).toEqual({
        document,
        destinationProvider: "upf",
        confirm: true,
        playlistId: "p2",
      });
    });

    expect(await screen.findByText("Finished")).toBeDefined();
  });

  it("lists every fault the server found, not just one message", async () => {
    stubApi({
      importResponse: {
        status: 400,
        body: {
          error: "That file is not a valid UPF document.",
          problems: [
            { path: "createdAt", message: "Not a valid ISO 8601 timestamp." },
            { path: "playlists[0].id", message: "Must not be empty." },
          ],
        },
      },
    });
    render(<UpfScreen />);

    upload("broken.upf.json", JSON.stringify(validDocument()));
    fireEvent.click(await screen.findByRole("button", { name: "Import" }));

    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText("createdAt")).toBeDefined();
    expect(within(alert).getByText("playlists[0].id")).toBeDefined();
    expect(alert.textContent).toContain("Not a valid ISO 8601 timestamp.");
  });

  it("offers only configured providers alongside the always-available file destination", async () => {
    stubApi({
      catalog: [
        { id: "youtube-music", displayName: "YouTube Music", authKind: "oauth2", configured: true },
        {
          id: "apple-music",
          displayName: "Apple Music",
          authKind: "serverToken",
          configured: false,
        },
      ],
    });
    render(<UpfScreen />);

    upload("backup.upf.json", JSON.stringify(validDocument()));

    const select = await screen.findByLabelText("Send it to");
    await waitFor(() => {
      expect(within(select).getByText("YouTube Music")).toBeDefined();
    });
    expect(within(select).queryByText("Apple Music")).toBeNull();
    expect(within(select).getByText("A UPF file (download)")).toBeDefined();
  });

  it("says plainly when nothing has been exported yet", async () => {
    stubApi();
    render(<UpfScreen />);

    expect(await screen.findByText(/Nothing exported yet/i)).toBeDefined();
  });

  it("lists exports with a download link, and nothing else", async () => {
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
    render(<UpfScreen />);

    const links = await screen.findAllByRole("link", { name: "Download" });
    expect(links).toHaveLength(1);
    expect(links[0]?.getAttribute("href")).toContain("/transfers/t9/upf");
    // A transfer with no document must not appear in an exports list.
    expect(screen.queryByText("def456")).toBeNull();
  });
});
