import type { Playlist, Track } from "./index.js";

export interface ParsedLine {
  /** 1-based, so a message can point at the line someone actually sees. */
  line: number;
  raw: string;
  title: string;
  artist?: string;
}

export interface TracklistParseResult {
  tracks: Track[];
  /** Lines that carried something but could not be read as a track. */
  skipped: { line: number; raw: string; reason: string }[];
}

/**
 * Leading list markers: "1.", "1)", "01 -", "-", "*", "•".
 * Anchored, and the numeric form requires a separator so a title that
 * genuinely starts with a number ("99 Luftballons") is not decapitated.
 */
const LIST_MARKER = /^\s*(?:\d{1,3}\s*[.)\-–—:]\s+|[-*•]\s+)/;

/** Trailing "(3:42)" or "[3:42]" — a duration, not part of the title. */
const TRAILING_DURATION = /[([]\s*\d{1,2}:\d{2}\s*[)\]]\s*$/;

/**
 * The separators people actually type between an artist and a title.
 * Order matters: the en/em dashes and " - " are checked before a bare
 * hyphen, because "Jay-Z - 99 Problems" must split on the spaced hyphen
 * and not on the one inside the name.
 */
const ARTIST_SEPARATORS = [" — ", " – ", " - ", " | ", " ~ "];

function stripQuotes(value: string): string {
  return value.replace(/^["'“”‘’]+|["'“”‘’]+$/g, "").trim();
}

/**
 * Splits one line into artist and title.
 *
 * Two orderings exist in the wild and they are genuinely ambiguous:
 * "Artist - Title" is the common one, and "Title - Artist" appears in
 * exports from some players. This assumes **Artist - Title**, because it
 * is far more common and because guessing per line would make one
 * pasted list parse inconsistently down its own length — which is worse
 * than being predictably wrong in a way the user can see and correct.
 */
function splitArtistAndTitle(value: string): { title: string; artist?: string } {
  for (const separator of ARTIST_SEPARATORS) {
    const index = value.indexOf(separator);
    if (index > 0) {
      const artist = stripQuotes(value.slice(0, index));
      const title = stripQuotes(value.slice(index + separator.length));
      if (artist && title) return { title, artist };
    }
  }

  // "Artist: Title" only when the colon is not part of a time or a
  // subtitle — requiring a space after it does most of that work.
  const colon = value.indexOf(": ");
  if (colon > 0) {
    const artist = stripQuotes(value.slice(0, colon));
    const title = stripQuotes(value.slice(colon + 2));
    if (artist && title) return { title, artist };
  }

  // "Title by Artist", the way someone writes it in a message.
  const by = / by /i.exec(value);
  if (by?.index !== undefined && by.index > 0) {
    const title = stripQuotes(value.slice(0, by.index));
    const artist = stripQuotes(value.slice(by.index + by[0].length));
    if (artist && title) return { title, artist };
  }

  return { title: stripQuotes(value) };
}

/** Splits a CSV-ish line, honouring double quotes around a field. */
function splitCsvLine(line: string): string[] | undefined {
  if (!line.includes(",")) return undefined;

  const fields: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      // A doubled quote inside a quoted field is an escaped quote.
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (character === "," && !quoted) {
      fields.push(current.trim());
      current = "";
      continue;
    }
    current += character;
  }
  fields.push(current.trim());

  return fields.length >= 2 ? fields : undefined;
}

const HEADER_WORDS = new Set(["track", "title", "song", "name", "artist", "album", "#"]);

/** A spreadsheet's header row is not a song. */
function looksLikeHeader(fields: string[]): boolean {
  const named = fields.filter(Boolean).map((field) => field.toLowerCase());
  if (named.length < 2) return false;
  return named.every((field) => HEADER_WORDS.has(field));
}

/**
 * Reads a pasted tracklist into UPF tracks.
 *
 * The point is that people's playlists are not always in a music
 * service. They are in notes, spreadsheets, group chats, blog posts and
 * the description under a video — and getting them *into* a service is
 * exactly the manual work this product exists to remove. Accepting text
 * needs no provider integration on the source side at all.
 *
 * Deliberately forgiving about shape and strict about reporting: every
 * line that carried something and could not be read comes back in
 * `skipped` with its line number, so the user can fix that line rather
 * than being told the paste "didn't work".
 */
export function parseTracklist(input: string): TracklistParseResult {
  const tracks: Track[] = [];
  const skipped: TracklistParseResult["skipped"] = [];

  input.split(/\r?\n/).forEach((rawLine, index) => {
    const line = index + 1;
    const trimmed = rawLine.trim();

    // Blank lines and comment/heading lines are structure, not failures,
    // so they are dropped silently rather than reported.
    if (!trimmed) return;
    if (/^(?:#|\/\/)/.test(trimmed)) return;

    const withoutMarker = trimmed.replace(LIST_MARKER, "").trim();
    if (!withoutMarker) return;

    const csv = splitCsvLine(withoutMarker);
    let parsed: { title: string; artist?: string };

    if (csv) {
      if (looksLikeHeader(csv)) return;
      // "Artist, Title" is the conventional column order in the exports
      // people paste, matching the "Artist - Title" assumption above.
      const [first, second] = csv;
      parsed =
        first && second
          ? { artist: stripQuotes(first), title: stripQuotes(second) }
          : splitArtistAndTitle(withoutMarker);
    } else {
      parsed = splitArtistAndTitle(withoutMarker.replace(TRAILING_DURATION, "").trim());
    }

    if (!parsed.title) {
      skipped.push({ line, raw: trimmed, reason: "No track title on this line." });
      return;
    }

    if (!parsed.artist) {
      skipped.push({
        line,
        raw: trimmed,
        reason: "No artist found. Use “Artist - Title” so it can be matched.",
      });
      return;
    }

    tracks.push({
      // Stable within one paste, and obviously not a provider id.
      id: `pasted-${line}`,
      title: parsed.title,
      artists: [{ id: `pasted-artist-${line}`, name: parsed.artist }],
    });
  });

  return { tracks, skipped };
}

/** Wraps parsed tracks as a playlist, ready to be a transfer source. */
export function tracklistToPlaylist(title: string, tracks: Track[]): Playlist {
  return {
    id: `pasted-${Date.now().toString(36)}`,
    title,
    items: tracks.map((track) => ({ track })),
  };
}
