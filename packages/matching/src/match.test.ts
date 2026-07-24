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
