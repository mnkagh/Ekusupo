import type { Track } from "@ekusupo/upf";

/**
 * Words that signal a re-release/edition rather than a different song —
 * stripped before comparing titles so "Mr. Brightside" and "Mr. Brightside
 * (2004 Remaster)" normalize to the same value.
 */
const NOISE_WORDS =
  "remaster(?:ed)?|live|mono|stereo|version|edit|mix|deluxe|bonus track|single version|radio edit";

const PARENTHETICAL_NOISE = new RegExp(
  `\\s*[([][^()[\\]]*(?:${NOISE_WORDS})[^()[\\]]*[)\\]]\\s*`,
  "gi",
);
const DASH_SUFFIX_NOISE = new RegExp(`\\s*-\\s*[^-]*(?:${NOISE_WORDS})[^-]*$`, "gi");

/**
 * The Latin/Greek/Cyrillic combining accents only — deliberately **not**
 * `\p{M}`, which would also catch U+3099/U+309A, the Japanese voiced
 * sound marks. Those are not decoration: stripping them turns か into が
 * and ハ into バ, merging words that are genuinely different.
 */
const LATIN_DIACRITICS = /[̀-ͯ]/g;

/** Anything that is not a letter or a digit **in any script**. */
const NON_ALPHANUMERIC = /[^\p{L}\p{N}]+/gu;

/**
 * Folds a string to the form titles and artists are compared in.
 *
 * This used to be `[^a-z0-9]+` → space, which deleted every character
 * outside the ASCII alphabet. That is not a rough edge for a
 * non-English library, it is a silent wrong answer: "夜に駆ける" and
 * "群青" both reduced to the empty string, so the matcher saw two
 * identical titles and, for two songs by the same artist, matched them.
 * The wrong track was transferred and the report called it a match.
 * Every non-Latin script had the same problem — Japanese, Korean,
 * Chinese, Cyrillic, Greek, Hebrew, Arabic, Thai.
 *
 * Accents were the mirror-image failure: "Café Tacvba" folded to
 * "caf tacvba" and no longer matched "Cafe Tacvba", so a real match was
 * missed over a typographic difference.
 */
function fold(value: string): string {
  return (
    value
      // Compatibility form first, so full-width Latin ("Ｄ") and
      // half-width katakana fold to their ordinary counterparts before
      // anything else looks at them.
      .normalize("NFKC")
      .toLowerCase()
      // Decompose, drop the accents, put it back together.
      .normalize("NFD")
      .replace(LATIN_DIACRITICS, "")
      .normalize("NFC")
      .replace(NON_ALPHANUMERIC, " ")
      .trim()
  );
}

export function normalizeTitle(title: string): string {
  return fold(title.replace(PARENTHETICAL_NOISE, " ").replace(DASH_SUFFIX_NOISE, " "));
}

export function normalizeArtistName(name: string): string {
  return fold(name);
}

export function primaryArtistName(track: Track): string | undefined {
  return track.artists[0]?.name;
}
