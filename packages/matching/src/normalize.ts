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

export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(PARENTHETICAL_NOISE, " ")
    .replace(DASH_SUFFIX_NOISE, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function normalizeArtistName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function primaryArtistName(track: Track): string | undefined {
  return track.artists[0]?.name;
}
