import type { Track } from "@ekusupo/upf";
import { describe, expect, it } from "vitest";

import { matchTrack } from "./match.js";

function track(overrides: Partial<Track> & Pick<Track, "id" | "title">): Track {
  return {
    artists: [{ id: "artist-1", name: "The Killers" }],
    ...overrides,
  };
}

describe("matchTrack", () => {
  it("matches by exact ISRC with high confidence and low risk", () => {
    const query = track({
      id: "src-1",
      title: "Mr. Brightside",
      externalIds: { isrc: "USIR20400274" },
    });
    const candidate = track({
      id: "dst-1",
      title: "Mr. Brightside",
      externalIds: { isrc: "USIR20400274" },
    });

    const outcome = matchTrack(query, [candidate]);

    expect(outcome.decision?.method).toBe("isrc_upc");
    expect(outcome.decision?.confidence).toBe(98);
    expect(outcome.decision?.risk).toBe("low");
    expect(outcome.decision?.candidate.id).toBe("dst-1");
  });

  it("matches a remastered edition within duration tolerance", () => {
    const query = track({ id: "src-1", title: "Mr. Brightside", durationMs: 222075 });
    const candidate = track({
      id: "dst-1",
      title: "Mr. Brightside - 2004 Remaster",
      durationMs: 222500,
    });

    const outcome = matchTrack(query, [candidate]);

    expect(outcome.decision?.method).toBe("duration_tolerance");
    expect(outcome.decision?.candidate.id).toBe("dst-1");
    expect(outcome.decision?.risk).toBe("low");
  });

  it("still matches on an explicit/clean disagreement, but raises risk", () => {
    const query = track({
      id: "src-1",
      title: "Mr. Brightside",
      externalIds: { isrc: "USIR20400274" },
      explicit: "explicit",
    });
    const candidate = track({
      id: "dst-1",
      title: "Mr. Brightside",
      externalIds: { isrc: "USIR20400274" },
      explicit: "clean",
    });

    const outcome = matchTrack(query, [candidate]);

    expect(outcome.decision?.candidate.id).toBe("dst-1");
    expect(outcome.decision?.risk).toBe("medium");
  });

  it("falls back to normalized title and artist when album/duration metadata is missing", () => {
    const query = track({ id: "src-1", title: "Mr. Brightside" });
    const candidate = track({ id: "dst-1", title: "mr brightside" });

    const outcome = matchTrack(query, [candidate]);

    expect(outcome.decision?.method).toBe("normalized_title_artist");
    expect(outcome.decision?.confidence).toBe(65);
  });

  it("returns no decision when nothing plausibly matches", () => {
    const query = track({ id: "src-1", title: "Mr. Brightside" });
    const candidate = track({
      id: "dst-1",
      title: "Somebody Told Me",
      artists: [{ id: "artist-1", name: "The Killers" }],
    });

    const outcome = matchTrack(query, [candidate]);

    expect(outcome.decision).toBeUndefined();
  });

  it("returns no decision for an empty candidate pool", () => {
    const query = track({ id: "src-1", title: "Mr. Brightside" });
    expect(matchTrack(query, []).decision).toBeUndefined();
  });

  it("flags ambiguous matches as high risk and lists alternatives", () => {
    const query = track({ id: "src-1", title: "Mr. Brightside" });
    const candidateA = track({ id: "dst-1", title: "Mr. Brightside" });
    const candidateB = track({ id: "dst-2", title: "Mr. Brightside" });

    const outcome = matchTrack(query, [candidateA, candidateB]);

    expect(outcome.decision?.risk).toBe("high");
    expect(outcome.decision?.alternatives).toHaveLength(1);
  });
});

describe("titles outside the Latin alphabet", () => {
  /**
   * The regression this guards is not a missed match but a *wrong* one.
   * Normalization used to delete every non-ASCII character, so two
   * unrelated Japanese songs by the same artist both reduced to an empty
   * title, compared equal, and were reported as a confident match — the
   * wrong track written to the destination, with a report saying it
   * worked.
   */
  it("does not match two different Japanese songs by the same artist", () => {
    const query = track({
      id: "src-1",
      title: "夜に駆ける",
      artists: [{ id: "a1", name: "YOASOBI" }],
    });
    const wrongSong = track({
      id: "dst-1",
      title: "群青",
      artists: [{ id: "a1", name: "YOASOBI" }],
    });

    expect(matchTrack(query, [wrongSong]).decision).toBeUndefined();
  });

  it("still matches the same Japanese song", () => {
    const query = track({
      id: "src-1",
      title: "夜に駆ける",
      artists: [{ id: "a1", name: "YOASOBI" }],
    });
    const sameSong = track({
      id: "dst-1",
      title: "夜に駆ける",
      artists: [{ id: "a2", name: "YOASOBI" }],
    });

    expect(matchTrack(query, [sameSong]).decision?.method).toBe("normalized_title_artist");
  });

  it("matches across an accent difference, which used to be missed", () => {
    const query = track({
      id: "src-1",
      title: "Hoppípolla",
      artists: [{ id: "a1", name: "Sigur Rós" }],
    });
    const candidate = track({
      id: "dst-1",
      title: "Hoppipolla",
      artists: [{ id: "a2", name: "Sigur Ros" }],
    });

    expect(matchTrack(query, [candidate]).decision?.method).toBe("normalized_title_artist");
  });

  it("refuses to match two tracks whose titles are only punctuation", () => {
    const query = track({ id: "src-1", title: "???", artists: [{ id: "a1", name: "Someone" }] });
    const other = track({ id: "dst-1", title: "!!!", artists: [{ id: "a1", name: "Someone" }] });

    expect(matchTrack(query, [other]).decision).toBeUndefined();
  });
});
