import { describe, expect, it } from "vitest";

import { normalizeArtistName, normalizeTitle } from "./normalize.js";

describe("normalizeTitle", () => {
  it("still strips edition noise", () => {
    expect(normalizeTitle("Mr. Brightside (2004 Remaster)")).toBe(normalizeTitle("Mr. Brightside"));
    expect(normalizeTitle("Song - Radio Edit")).toBe(normalizeTitle("Song"));
  });

  describe("scripts other than Latin", () => {
    // The bug this replaced deleted every non-ASCII character, so each
    // of these folded to the empty string — and the matcher then read
    // two empty strings as the same title.
    it("keeps a Japanese title instead of erasing it", () => {
      expect(normalizeTitle("夜に駆ける")).not.toBe("");
    });

    it("keeps two different Japanese titles different", () => {
      expect(normalizeTitle("夜に駆ける")).not.toBe(normalizeTitle("群青"));
    });

    it.each([
      ["Cyrillic", "Привет", "Пока"],
      ["Greek", "Γεια", "Αντίο"],
      ["Korean", "밤편지", "봄날"],
      ["Chinese", "光年之外", "起风了"],
      ["Arabic", "قلبي", "روحي"],
      ["Hebrew", "שלום", "תודה"],
      ["Thai", "รักเธอ", "คิดถึง"],
    ])("keeps two different %s titles apart", (_script, first, second) => {
      expect(normalizeTitle(first)).not.toBe("");
      expect(normalizeTitle(second)).not.toBe("");
      expect(normalizeTitle(first)).not.toBe(normalizeTitle(second));
    });
  });

  describe("accents and width", () => {
    it("folds Latin accents, so one spelling matches the other", () => {
      expect(normalizeTitle("Café Tacvba")).toBe(normalizeTitle("Cafe Tacvba"));
      expect(normalizeTitle("Björk")).toBe(normalizeTitle("Bjork"));
    });

    it("folds full-width Latin to ordinary Latin", () => {
      expect(normalizeTitle("ＴＯＫＹＯ")).toBe(normalizeTitle("TOKYO"));
    });

    it("does NOT strip the Japanese voiced sound mark", () => {
      // が is not "か with an accent" — they are different kana. A fold
      // that dropped every combining mark would merge them, which is the
      // same class of false positive in a different disguise.
      expect(normalizeTitle("ばら")).not.toBe(normalizeTitle("はら"));
      expect(normalizeTitle("バス")).not.toBe(normalizeTitle("パス"));
    });
  });

  it("folds a title that is only punctuation to nothing", () => {
    // Callers must treat this as "cannot compare", not as a value.
    expect(normalizeTitle("???")).toBe("");
    expect(normalizeTitle("♥")).toBe("");
  });
});

describe("normalizeArtistName", () => {
  it("keeps a non-Latin artist name", () => {
    expect(normalizeArtistName("宇多田ヒカル")).not.toBe("");
    expect(normalizeArtistName("宇多田ヒカル")).not.toBe(normalizeArtistName("米津玄師"));
  });

  it("folds accents", () => {
    expect(normalizeArtistName("Sigur Rós")).toBe(normalizeArtistName("Sigur Ros"));
  });
});
