import { describe, expect, it } from "vitest";

import { parseTracklist } from "./tracklist.js";

/** Terser assertions: most cases only care about artist and title. */
function pairs(input: string) {
  return parseTracklist(input).tracks.map((track) => [track.artists[0]?.name, track.title]);
}

describe("parseTracklist", () => {
  it("reads the plain 'Artist - Title' form", () => {
    expect(pairs("The Killers - Mr. Brightside")).toEqual([["The Killers", "Mr. Brightside"]]);
  });

  it.each([
    ["en dash", "Daft Punk – One More Time"],
    ["em dash", "Daft Punk — One More Time"],
    ["pipe", "Daft Punk | One More Time"],
    ["colon", "Daft Punk: One More Time"],
    ["by", "One More Time by Daft Punk"],
  ])("reads the %s form", (_name, line) => {
    expect(pairs(line)).toEqual([["Daft Punk", "One More Time"]]);
  });

  it("strips list markers of every common shape", () => {
    const input = ["1. A - One", "2) B - Two", "03 - C - Three", "- D - Four", "• E - Five"].join(
      "\n",
    );

    expect(pairs(input)).toEqual([
      ["A", "One"],
      ["B", "Two"],
      ["C", "Three"],
      ["D", "Four"],
      ["E", "Five"],
    ]);
  });

  it("does not eat a number that is part of the title", () => {
    // "99 Luftballons" has no separator after the number, so it is not a
    // list marker — decapitating it would silently change the song.
    expect(pairs("Nena - 99 Luftballons")).toEqual([["Nena", "99 Luftballons"]]);
  });

  it("splits on the spaced hyphen, not one inside a name", () => {
    expect(pairs("Jay-Z - 99 Problems")).toEqual([["Jay-Z", "99 Problems"]]);
  });

  it("drops a trailing duration", () => {
    expect(pairs("Pink Floyd - Time (6:53)")).toEqual([["Pink Floyd", "Time"]]);
    expect(pairs("Pink Floyd - Time [6:53]")).toEqual([["Pink Floyd", "Time"]]);
  });

  it("keeps a parenthetical that is part of the title", () => {
    // Only a *duration* is noise. A version marker belongs to the title
    // and the matching engine handles it from there.
    expect(pairs("Whitney Houston - I Wanna Dance (Remastered)")).toEqual([
      ["Whitney Houston", "I Wanna Dance (Remastered)"],
    ]);
  });

  it("removes surrounding quotes", () => {
    expect(pairs('Radiohead - "Creep"')).toEqual([["Radiohead", "Creep"]]);
  });

  it("reads CSV, including a quoted field containing a comma", () => {
    const input = ["Artist,Title", 'Bowie,"Space Oddity"', '"Earth, Wind & Fire",September'].join(
      "\n",
    );

    // The header row is recognised and dropped rather than imported as a
    // song called "Title".
    expect(pairs(input)).toEqual([
      ["Bowie", "Space Oddity"],
      ["Earth, Wind & Fire", "September"],
    ]);
  });

  it("ignores blank lines and comments without reporting them", () => {
    const result = parseTracklist("\n# my favourites\n\nA - One\n// note\n");

    expect(result.tracks).toHaveLength(1);
    expect(result.skipped).toHaveLength(0);
  });

  it("reports a line it cannot read, with the line number and the reason", () => {
    const result = parseTracklist("A - One\nsomething with no artist\nB - Two");

    expect(result.tracks).toHaveLength(2);
    expect(result.skipped).toEqual([
      {
        line: 2,
        raw: "something with no artist",
        reason: expect.stringContaining("No artist"),
      },
    ]);
  });

  it("keeps going after a bad line rather than giving up on the paste", () => {
    // The whole point: one unreadable line out of forty must not cost
    // someone the other thirty-nine.
    const lines = Array.from({ length: 20 }, (_, index) => `Artist${index} - Song${index}`);
    lines.splice(7, 0, "???");

    const result = parseTracklist(lines.join("\n"));

    expect(result.tracks).toHaveLength(20);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]?.line).toBe(8);
  });

  it("returns nothing for an empty paste", () => {
    expect(parseTracklist("   \n\n  ")).toEqual({ tracks: [], skipped: [] });
  });

  it("gives each track a distinct id", () => {
    const { tracks } = parseTracklist("A - One\nB - Two\nC - Three");
    expect(new Set(tracks.map((track) => track.id)).size).toBe(3);
  });
});
