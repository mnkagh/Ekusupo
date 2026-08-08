import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { AuthSession } from "@ekusupo/connector-sdk";
import { runLiveTransfer } from "@ekusupo/core";
import { createSpotifyProvider } from "@ekusupo/provider-spotify";
import { createUpfFileProvider } from "@ekusupo/provider-upf-file";
import type { UpfDocument } from "@ekusupo/upf";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/** Same fixture style as cross-provider-dry-run.test.ts and packages/providers/spotify's own tests. */
const playlistFixture = {
  id: "37i9dQZF1DXcBWIGoYBM5M",
  name: "Today's Top Hits",
  public: true,
  tracks: {
    total: 2,
    items: [
      {
        added_at: "2026-01-01T00:00:00.000Z",
        added_by: { id: "spotify" },
        track: {
          id: "003vvx7Niy0yvhvHt4a68B",
          name: "Mr. Brightside",
          duration_ms: 222075,
          explicit: false,
          artists: [{ id: "0C0XlULifJtAgn6ZNCW2eu", name: "The Killers" }],
        },
      },
      {
        added_at: "2026-01-01T00:00:05.000Z",
        added_by: { id: "spotify" },
        track: {
          id: "7ouMYWpwJ422jRcDASZB7P",
          name: "Knights of Cydonia",
          duration_ms: 366213,
          explicit: false,
          artists: [{ id: "12Chz98pHFMPJEknJQMWvI", name: "Muse" }],
        },
      },
    ],
  },
};

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function fakeSpotifyFetch(): typeof fetch {
  return (async (input: string | URL | Request) =>
    input.toString().includes("/playlists/")
      ? jsonResponse(playlistFixture)
      : jsonResponse({ error: "not found" })) as unknown as typeof fetch;
}

const spotifySession: AuthSession = { method: "oauth2", raw: { accessToken: "fake" } };
const fileSession: AuthSession = { method: "none", raw: {} };

let dir: string;
let filePath: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "ekusupo-cross-provider-live-"));
  filePath = join(dir, "backup.upf.json");
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("cross-provider Live Transfer: Spotify -> UPF file (ADR-0018)", () => {
  it("really writes Spotify's tracks into a real UPF file destination", async () => {
    const spotify = createSpotifyProvider({ fetchImpl: fakeSpotifyFetch() });
    const upfFile = createUpfFileProvider({ filePath });

    const { job, report } = await runLiveTransfer({
      source: spotify,
      sourceSession: spotifySession,
      destination: upfFile,
      destinationSession: fileSession,
      sourcePlaylistId: playlistFixture.id,
    });

    expect(job.status).toBe("completed");
    expect(job.dryRun).toBe(false);
    expect(report.sourceProvider).toBe("spotify");
    expect(report.destinationProvider).toBe("upf-file");
    expect(report.totalItems).toBe(2);
    expect(report.createdItems).toBe(2);
    expect(report.failedItems).toBe(0);
    // Write-through, not matching — see ADR-0018.
    expect(report.matchedItems).toBe(0);
    expect(report.providerLimitationsEncountered).toEqual([
      "Destination provider cannot search tracks — items are written through as-is, without matching.",
    ]);

    // Not just the report — the file on disk really has it.
    const onDisk = JSON.parse(await readFile(filePath, "utf-8")) as UpfDocument;
    expect(onDisk.playlists).toHaveLength(1);
    const written = onDisk.playlists[0];
    expect(written?.title).toBe("Today's Top Hits");
    expect(written?.items.map((item) => item.track.title)).toEqual([
      "Mr. Brightside",
      "Knights of Cydonia",
    ]);
    // The exact source track data survived — not a fabricated candidate.
    expect(written?.items[0]?.track.artists[0]?.name).toBe("The Killers");
    expect(written?.items[0]?.track.externalIds).toBeUndefined();

    // Readable straight back through the same connector, proving this
    // isn't just a one-off write — it's a real playlist in the library.
    const readBack = await upfFile.getPlaylist?.(fileSession, written?.id ?? "");
    expect(readBack?.items).toHaveLength(2);
  });
});
