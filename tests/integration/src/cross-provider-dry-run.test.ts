import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { AuthSession } from "@ekusupo/connector-sdk";
import { runDryRunTransfer } from "@ekusupo/core";
import { createSpotifyProvider } from "@ekusupo/provider-spotify";
import { createUpfFileProvider } from "@ekusupo/provider-upf-file";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * Same fixture style as packages/providers/spotify/src/provider.test.ts
 * — no live network call, ever (CLAUDE.md §12.3).
 */
const playlistFixture = {
  id: "37i9dQZF1DXcBWIGoYBM5M",
  name: "Today's Top Hits",
  public: true,
  tracks: {
    total: 1,
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
  dir = await mkdtemp(join(tmpdir(), "ekusupo-cross-provider-"));
  filePath = join(dir, "backup.upf.json");
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("cross-provider Dry Run: Spotify -> UPF file", () => {
  it("produces a real plan across two independently-implemented connectors", async () => {
    const spotify = createSpotifyProvider({ fetchImpl: fakeSpotifyFetch() });
    const upfFile = createUpfFileProvider({ filePath });

    const { job, report } = await runDryRunTransfer({
      source: spotify,
      sourceSession: spotifySession,
      destination: upfFile,
      destinationSession: fileSession,
      sourcePlaylistId: playlistFixture.id,
    });

    expect(job.dryRun).toBe(true);
    expect(report.sourceProvider).toBe("spotify");
    expect(report.destinationProvider).toBe("upf-file");
    expect(report.totalItems).toBe(1);

    // Neither real provider can search a destination catalog — Spotify's
    // reference implementation is read-only, and a UPF file has no
    // catalog at all (ADR-0016) — so Dry Run reports that limitation
    // once, exactly like ADR-0011's original single-provider case, now
    // proven true across two real connectors instead of one.
    expect(report.providerLimitationsEncountered).toEqual([
      "Destination provider cannot search tracks — dry run produced a plan without destination matches.",
    ]);
    expect(report.matchedItems).toBe(0);
    expect(report.skippedItems).toBe(1);
  });

  it("never writes to the destination file during a dry run", async () => {
    const spotify = createSpotifyProvider({ fetchImpl: fakeSpotifyFetch() });
    const upfFile = createUpfFileProvider({ filePath });

    await runDryRunTransfer({
      source: spotify,
      sourceSession: spotifySession,
      destination: upfFile,
      destinationSession: fileSession,
      sourcePlaylistId: playlistFixture.id,
    });

    const page = await upfFile.listPlaylists?.(fileSession);
    expect(page?.items).toEqual([]);
  });
});

describe("cross-provider export: Spotify -> UPF file (outside the Transfer Engine)", () => {
  it("reads a real source playlist and writes it into a real destination file directly", async () => {
    // Not runLiveTransfer — see ADR-0016 for why a file destination can't
    // go through the Transfer Engine's match-based write path. This is
    // what a future Export/Backup feature (CLAUDE.md §2.3, §8.2) would
    // build on: read via one connector's contract, write via another's,
    // with @ekusupo/upf as the shared shape in between.
    const spotify = createSpotifyProvider({ fetchImpl: fakeSpotifyFetch() });
    const upfFile = createUpfFileProvider({ filePath });

    const sourcePlaylist = await spotify.getPlaylist?.(spotifySession, playlistFixture.id);
    expect(sourcePlaylist).toBeDefined();

    const created = await upfFile.createPlaylist?.(fileSession, {
      title: sourcePlaylist?.title ?? "",
      tracks: sourcePlaylist?.items.map((item) => item.track),
    });

    expect(created?.title).toBe("Today's Top Hits");
    expect(created?.items[0]?.track.title).toBe("Mr. Brightside");
    expect(created?.items[0]?.track.artists[0]?.name).toBe("The Killers");

    const readBack = await upfFile.getPlaylist?.(fileSession, created?.id ?? "");
    expect(readBack?.items).toHaveLength(1);
  });
});
