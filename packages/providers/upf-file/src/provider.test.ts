import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { AuthSession } from "@ekusupo/connector-sdk";
import { ConnectorError } from "@ekusupo/connector-sdk";
import type { UpfDocument } from "@ekusupo/upf";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createUpfFileProvider } from "./provider.js";

const session: AuthSession = { method: "none", raw: {} };

let dir: string;
let filePath: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "ekusupo-upf-file-"));
  filePath = join(dir, "library.upf.json");
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("createUpfFileProvider", () => {
  it("exposes its manifest and read/write playlist capabilities, but never search", () => {
    const provider = createUpfFileProvider({ filePath });
    expect(provider.manifest.name).toBe("upf-file");
    expect(provider.getCapabilities().supports.has("playlists.read")).toBe(true);
    expect(provider.getCapabilities().supports.has("playlists.create")).toBe(true);
    expect(provider.getCapabilities().supports.has("playlists.addTracks")).toBe(true);
    expect(provider.getCapabilities().supports.has("tracks.search")).toBe(false);
    expect(provider.searchTracks).toBeUndefined();
  });

  it("needs no real authentication", async () => {
    const provider = createUpfFileProvider({ filePath });
    const result = await provider.authenticate({ method: "none", raw: {} });
    expect(result).toEqual({ method: "none", raw: {} });
  });

  it("lists no playlists and treats a missing file as an empty library, not an error", async () => {
    const provider = createUpfFileProvider({ filePath });
    const page = await provider.listPlaylists?.(session);
    expect(page).toEqual({ items: [] });
  });

  it("throws not_found for a playlist id that doesn't exist yet", async () => {
    const provider = createUpfFileProvider({ filePath });
    await expect(provider.getPlaylist?.(session, "missing")).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(provider.getPlaylist?.(session, "missing")).rejects.toBeInstanceOf(ConnectorError);
  });

  it("creates a playlist, persists it to disk, and can read it straight back", async () => {
    const provider = createUpfFileProvider({ filePath });

    const created = await provider.createPlaylist?.(session, {
      title: "Road Trip",
      tracks: [{ id: "t1", title: "Song One", artists: [{ id: "a1", name: "Artist" }] }],
    });
    expect(created?.title).toBe("Road Trip");
    expect(created?.items).toHaveLength(1);

    const onDisk = JSON.parse(await readFile(filePath, "utf-8")) as UpfDocument;
    expect(onDisk.format).toBe("upf");
    expect(onDisk.playlists).toHaveLength(1);

    const readBack = await provider.getPlaylist?.(session, created?.id ?? "");
    expect(readBack?.title).toBe("Road Trip");
    expect(readBack?.items[0]?.track.title).toBe("Song One");
  });

  it("appends tracks to an existing playlist across separate calls", async () => {
    const provider = createUpfFileProvider({ filePath });
    const created = await provider.createPlaylist?.(session, { title: "Favorites" });

    await provider.addTracksToPlaylist?.(session, created?.id ?? "", [
      { id: "t1", title: "First", artists: [{ id: "a1", name: "Artist" }] },
    ]);
    const playlist = await provider.addTracksToPlaylist?.(session, created?.id ?? "", [
      { id: "t2", title: "Second", artists: [{ id: "a1", name: "Artist" }] },
    ]);

    expect(playlist?.items.map((item) => item.track.title)).toEqual(["First", "Second"]);
    expect(playlist?.updatedAt).toBeDefined();
  });

  it("survives being read by a second provider instance pointed at the same file", async () => {
    const first = createUpfFileProvider({ filePath });
    await first.createPlaylist?.(session, { title: "Shared" });

    const second = createUpfFileProvider({ filePath });
    const page = await second.listPlaylists?.(session);
    expect(page?.items).toHaveLength(1);
    expect(page?.items[0]?.title).toBe("Shared");
  });

  it("wraps a corrupted file as a validation_error instead of throwing a raw SyntaxError", async () => {
    await writeFile(filePath, "not json", "utf-8");
    const provider = createUpfFileProvider({ filePath });

    await expect(provider.listPlaylists?.(session)).rejects.toMatchObject({
      code: "validation_error",
    });
  });
});

describe("a file that is JSON but not UPF", () => {
  /**
   * These used to get through `JSON.parse(raw) as UpfDocument` and fail
   * later as a TypeError about `.find` or `.push` — an error naming
   * neither the file nor what was wrong with it.
   */
  it.each([
    [
      "playlists missing",
      { format: "upf", version: "0.1.0", createdAt: "2026-01-01T00:00:00.000Z" },
    ],
    [
      "playlists null",
      { format: "upf", version: "0.1.0", createdAt: "2026-01-01T00:00:00.000Z", playlists: null },
    ],
    ["a bare array", []],
    ["a bare string", "not a document"],
    ["an unrelated object", { hello: "world" }],
  ])("refuses %s with a validation error naming the file", async (_case, contents) => {
    await writeFile(filePath, JSON.stringify(contents), "utf-8");
    const provider = createUpfFileProvider({ filePath });

    await expect(provider.listPlaylists!(session)).rejects.toThrow(ConnectorError);
    await expect(provider.listPlaylists!(session)).rejects.toThrow(/is not a valid UPF document/);
  });

  it("still reports malformed JSON separately from a wrong shape", async () => {
    await writeFile(filePath, "{not json", "utf-8");
    const provider = createUpfFileProvider({ filePath });

    await expect(provider.listPlaylists!(session)).rejects.toThrow(/is not valid JSON/);
  });

  it("says which field was wrong, not just that something was", async () => {
    await writeFile(
      filePath,
      JSON.stringify({
        format: "upf",
        version: "0.1.0",
        createdAt: "2026-01-01T00:00:00.000Z",
        playlists: [{ id: "p1", items: [] }],
      }),
      "utf-8",
    );
    const provider = createUpfFileProvider({ filePath });

    await expect(provider.listPlaylists!(session)).rejects.toThrow(/title/);
  });
});
