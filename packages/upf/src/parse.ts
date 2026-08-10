import type { Artist } from "./artist.js";
import { UPF_FORMAT_NAME, UPF_FORMAT_VERSION } from "./document.js";
import type { UpfDocument } from "./document.js";
import type { Playlist, PlaylistItem, PlaylistPrivacy } from "./playlist.js";
import type { ExplicitContentState, Track } from "./track.js";

/**
 * A parsed document, or every reason it could not be parsed — not the
 * first one. Someone fixing a hand-edited or third-party UPF file wants
 * the whole list; returning only the first error turns one repair into
 * as many round trips as there are mistakes.
 *
 * A result rather than a thrown error because an invalid document is an
 * ordinary, expected outcome of accepting a file from a user
 * (CLAUDE.md §16.3 — validation errors are a classified category, not an
 * exception).
 */
export type UpfParseResult =
  { ok: true; document: UpfDocument } | { ok: false; errors: UpfParseError[] };

export interface UpfParseError {
  /** Where the problem is, e.g. `playlists[0].items[3].track.title`. */
  path: string;
  message: string;
}

/**
 * A malformed file can produce an error per track and there is no value
 * in the ten-thousandth one. The count is reported honestly when the
 * list is truncated rather than the extras being dropped silently.
 */
const MAX_ERRORS = 50;

const PRIVACY_VALUES: readonly PlaylistPrivacy[] = ["public", "private", "unlisted", "unknown"];
const EXPLICIT_VALUES: readonly ExplicitContentState[] = ["explicit", "clean", "unknown"];

class ErrorCollector {
  readonly errors: UpfParseError[] = [];
  private overflow = 0;

  add(path: string, message: string): void {
    if (this.errors.length < MAX_ERRORS) {
      this.errors.push({ path, message });
    } else {
      this.overflow += 1;
    }
  }

  get full(): boolean {
    return this.overflow > 0;
  }

  finish(): UpfParseError[] {
    if (this.overflow === 0) return this.errors;
    return [
      ...this.errors,
      { path: "", message: `…and ${this.overflow} further problems, not listed.` },
    ];
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(
  value: unknown,
  path: string,
  errors: ErrorCollector,
  { allowEmpty = false } = {},
): value is string {
  if (typeof value !== "string") {
    errors.add(path, `Expected a string, got ${describe(value)}.`);
    return false;
  }
  if (!allowEmpty && value.length === 0) {
    errors.add(path, "Must not be empty.");
    return false;
  }
  return true;
}

function describe(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  return `a ${typeof value}`;
}

/**
 * `0.x` treats the minor as the breaking axis, so a `0.2` document is not
 * assumed readable by a `0.1` parser. A *newer* document is rejected
 * because this code cannot know what it does not know; an older one is
 * accepted, since v0.1 is the first release and nothing precedes it.
 */
function checkVersion(version: string, errors: ErrorCollector): void {
  const [major, minor] = version.split(".");
  const [currentMajor, currentMinor] = UPF_FORMAT_VERSION.split(".");

  if (major === undefined || minor === undefined || !/^\d+$/.test(major) || !/^\d+$/.test(minor)) {
    errors.add("version", `Not a semver version: "${version}".`);
    return;
  }

  const tooNew =
    Number(major) > Number(currentMajor) ||
    (major === currentMajor && Number(major) === 0 && Number(minor) > Number(currentMinor));

  if (tooNew) {
    errors.add(
      "version",
      `This file is UPF ${version}, which is newer than the ${UPF_FORMAT_VERSION} this build understands. Upgrade Ekusupo to read it.`,
    );
  }
}

function parseArtists(value: unknown, path: string, errors: ErrorCollector): Artist[] {
  if (!Array.isArray(value)) {
    errors.add(path, `Expected an array of artists, got ${describe(value)}.`);
    return [];
  }

  const artists: Artist[] = [];
  value.forEach((entry, index) => {
    const at = `${path}[${index}]`;
    if (!isRecord(entry)) {
      errors.add(at, `Expected an artist object, got ${describe(entry)}.`);
      return;
    }
    const idOk = requireString(entry.id, `${at}.id`, errors);
    const nameOk = requireString(entry.name, `${at}.name`, errors);
    if (idOk && nameOk) artists.push(entry as unknown as Artist);
  });
  return artists;
}

function parseTrack(value: unknown, path: string, errors: ErrorCollector): Track | null {
  if (!isRecord(value)) {
    errors.add(path, `Expected a track object, got ${describe(value)}.`);
    return null;
  }

  const idOk = requireString(value.id, `${path}.id`, errors);
  const titleOk = requireString(value.title, `${path}.title`, errors);
  const artists = parseArtists(value.artists, `${path}.artists`, errors);

  if (value.durationMs !== undefined) {
    if (
      typeof value.durationMs !== "number" ||
      !Number.isInteger(value.durationMs) ||
      value.durationMs < 0
    ) {
      errors.add(`${path}.durationMs`, "Must be a non-negative integer number of milliseconds.");
    }
  }

  if (value.explicit !== undefined && !EXPLICIT_VALUES.includes(value.explicit as never)) {
    errors.add(`${path}.explicit`, `Must be one of: ${EXPLICIT_VALUES.join(", ")}.`);
  }

  if (!idOk || !titleOk) return null;
  return { ...value, artists } as unknown as Track;
}

function parseItems(value: unknown, path: string, errors: ErrorCollector): PlaylistItem[] {
  if (!Array.isArray(value)) {
    errors.add(path, `Expected an array of playlist items, got ${describe(value)}.`);
    return [];
  }

  const items: PlaylistItem[] = [];
  value.forEach((entry, index) => {
    const at = `${path}[${index}]`;
    if (!isRecord(entry)) {
      errors.add(at, `Expected a playlist item object, got ${describe(entry)}.`);
      return;
    }
    const track = parseTrack(entry.track, `${at}.track`, errors);
    if (entry.addedAt !== undefined) requireString(entry.addedAt, `${at}.addedAt`, errors);
    if (entry.addedBy !== undefined) requireString(entry.addedBy, `${at}.addedBy`, errors);
    if (track) items.push({ ...entry, track } as unknown as PlaylistItem);
  });
  return items;
}

function parsePlaylist(value: unknown, path: string, errors: ErrorCollector): Playlist | null {
  if (!isRecord(value)) {
    errors.add(path, `Expected a playlist object, got ${describe(value)}.`);
    return null;
  }

  const idOk = requireString(value.id, `${path}.id`, errors);
  // A playlist legitimately may be untitled on some providers, so an
  // empty string is accepted here where an empty id is not.
  const titleOk = requireString(value.title, `${path}.title`, errors, { allowEmpty: true });
  const items = parseItems(value.items, `${path}.items`, errors);

  if (value.privacy !== undefined && !PRIVACY_VALUES.includes(value.privacy as never)) {
    errors.add(`${path}.privacy`, `Must be one of: ${PRIVACY_VALUES.join(", ")}.`);
  }
  if (value.description !== undefined) {
    requireString(value.description, `${path}.description`, errors, { allowEmpty: true });
  }

  if (!idOk || !titleOk) return null;
  return { ...value, items } as unknown as Playlist;
}

/**
 * Validates an already-JSON-parsed value against UPF v0.1 (see
 * docs/universal-playlist-format.md). Unknown fields are preserved rather
 * than stripped — §5.5's provider extensions live there, and a document
 * that survives a round trip through Ekusupo without losing them is the
 * whole point of the format.
 */
export function parseUpfDocument(input: unknown): UpfParseResult {
  const errors = new ErrorCollector();

  if (!isRecord(input)) {
    return {
      ok: false,
      errors: [{ path: "", message: `Expected a UPF document object, got ${describe(input)}.` }],
    };
  }

  if (input.format !== UPF_FORMAT_NAME) {
    errors.add(
      "format",
      `Expected "${UPF_FORMAT_NAME}", got ${JSON.stringify(input.format) ?? "nothing"}. This does not look like a UPF file.`,
    );
  }

  if (requireString(input.version, "version", errors)) {
    checkVersion(input.version, errors);
  }

  if (requireString(input.createdAt, "createdAt", errors)) {
    if (Number.isNaN(Date.parse(input.createdAt))) {
      errors.add("createdAt", `Not a valid ISO 8601 timestamp: "${input.createdAt}".`);
    }
  }

  let playlists: Playlist[] = [];
  if (!Array.isArray(input.playlists)) {
    errors.add("playlists", `Expected an array, got ${describe(input.playlists)}.`);
  } else {
    playlists = input.playlists
      .map((entry, index) => parsePlaylist(entry, `playlists[${index}]`, errors))
      .filter((playlist): playlist is Playlist => playlist !== null);
  }

  if (errors.errors.length > 0 || errors.full) {
    return { ok: false, errors: errors.finish() };
  }

  return { ok: true, document: { ...input, playlists } as unknown as UpfDocument };
}

/** Convenience for the common case: raw text straight off an upload. */
export function parseUpfJson(text: string): UpfParseResult {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    return {
      ok: false,
      errors: [
        {
          path: "",
          message: `Not valid JSON: ${error instanceof Error ? error.message : "unparseable"}.`,
        },
      ],
    };
  }
  return parseUpfDocument(value);
}
