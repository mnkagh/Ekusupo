import { describe, expect, it } from "vitest";

import { UPF_FORMAT_VERSION } from "./document.js";
import { parseUpfDocument, parseUpfJson } from "./parse.js";
import type { UpfParseError } from "./parse.js";

function validDocument(): unknown {
  return {
    format: "upf",
    version: UPF_FORMAT_VERSION,
    createdAt: "2026-01-01T00:00:00.000Z",
    source: { provider: "spotify", exportedBy: "Ekusupo" },
    playlists: [
      {
        id: "playlist-1",
        title: "Today's Top Hits",
        privacy: "public",
        items: [
          {
            addedAt: "2026-01-01T00:00:00.000Z",
            track: {
              id: "track-1",
              title: "Mr. Brightside",
              artists: [{ id: "artist-1", name: "The Killers" }],
              durationMs: 222075,
              explicit: "clean",
            },
          },
        ],
      },
    ],
  };
}

function pathsOf(errors: UpfParseError[]): string[] {
  return errors.map((error) => error.path);
}

describe("parseUpfDocument", () => {
  it("accepts a well-formed document", () => {
    const result = parseUpfDocument(validDocument());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.playlists).toHaveLength(1);
    expect(result.document.playlists[0]?.items[0]?.track.title).toBe("Mr. Brightside");
  });

  it("preserves unknown fields rather than stripping them", () => {
    // UPF §5.5 provider extensions live in fields this parser has never
    // heard of. Dropping them would make a round trip through Ekusupo
    // lossy, which is the opposite of the format's purpose.
    const document = validDocument() as Record<string, unknown>;
    document.vendorExtension = { anything: true };

    const result = parseUpfDocument(document);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect((result.document as unknown as Record<string, unknown>).vendorExtension).toEqual({
      anything: true,
    });
  });

  it("rejects a document that is not an object", () => {
    for (const input of [null, "upf", 42, [], undefined]) {
      expect(parseUpfDocument(input).ok).toBe(false);
    }
  });

  it("rejects a JSON file that is not UPF at all", () => {
    const result = parseUpfDocument({ some: "other", json: true });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(pathsOf(result.errors)).toContain("format");
    expect(result.errors[0]?.message).toMatch(/does not look like a UPF file/);
  });

  it("reports every problem, not just the first", () => {
    const result = parseUpfDocument({
      format: "upf",
      version: UPF_FORMAT_VERSION,
      createdAt: "not a date",
      playlists: [{ id: "", title: 7, items: "nope" }],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(pathsOf(result.errors)).toEqual(
      expect.arrayContaining([
        "createdAt",
        "playlists[0].id",
        "playlists[0].title",
        "playlists[0].items",
      ]),
    );
  });

  it("names the exact track that is wrong", () => {
    const document = validDocument() as {
      playlists: { items: { track: Record<string, unknown> }[] }[];
    };
    document.playlists[0]!.items[0]!.track.artists = "The Killers";

    const result = parseUpfDocument(document);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(pathsOf(result.errors)).toContain("playlists[0].items[0].track.artists");
  });

  it("rejects a document from a newer UPF than this build understands", () => {
    const document = validDocument() as Record<string, unknown>;
    document.version = "0.99.0";

    const result = parseUpfDocument(document);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]?.message).toMatch(/newer than the 0\.1\.0 this build understands/);
  });

  it("rejects a version string that is not semver", () => {
    const document = validDocument() as Record<string, unknown>;
    document.version = "one";

    expect(parseUpfDocument(document).ok).toBe(false);
  });

  it("allows an untitled playlist but not one without an id", () => {
    const withEmptyTitle = validDocument() as { playlists: Record<string, unknown>[] };
    withEmptyTitle.playlists[0]!.title = "";
    expect(parseUpfDocument(withEmptyTitle).ok).toBe(true);

    const withEmptyId = validDocument() as { playlists: Record<string, unknown>[] };
    withEmptyId.playlists[0]!.id = "";
    expect(parseUpfDocument(withEmptyId).ok).toBe(false);
  });

  it("accepts an empty playlist and an empty library", () => {
    const empty = validDocument() as { playlists: { items: unknown[] }[] };
    empty.playlists[0]!.items = [];
    expect(parseUpfDocument(empty).ok).toBe(true);

    const noPlaylists = validDocument() as Record<string, unknown>;
    noPlaylists.playlists = [];
    expect(parseUpfDocument(noPlaylists).ok).toBe(true);
  });

  it("rejects out-of-range enum and numeric values", () => {
    const document = validDocument() as {
      playlists: { privacy: unknown; items: { track: Record<string, unknown> }[] }[];
    };
    document.playlists[0]!.privacy = "secret";
    document.playlists[0]!.items[0]!.track.explicit = "maybe";
    document.playlists[0]!.items[0]!.track.durationMs = -1;

    const result = parseUpfDocument(document);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(pathsOf(result.errors)).toEqual(
      expect.arrayContaining([
        "playlists[0].privacy",
        "playlists[0].items[0].track.explicit",
        "playlists[0].items[0].track.durationMs",
      ]),
    );
  });

  it("truncates a flood of errors and says how many it dropped", () => {
    const playlists = Array.from({ length: 200 }, () => ({ id: "", title: "x", items: [] }));

    const result = parseUpfDocument({
      format: "upf",
      version: UPF_FORMAT_VERSION,
      createdAt: "2026-01-01T00:00:00.000Z",
      playlists,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toHaveLength(51);
    expect(result.errors.at(-1)?.message).toMatch(/and 150 further problems/);
  });
});

describe("parseUpfJson", () => {
  it("parses valid JSON text", () => {
    expect(parseUpfJson(JSON.stringify(validDocument())).ok).toBe(true);
  });

  it("reports malformed JSON as a validation error, not a crash", () => {
    const result = parseUpfJson("{ not json");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]?.message).toMatch(/Not valid JSON/);
  });
});
