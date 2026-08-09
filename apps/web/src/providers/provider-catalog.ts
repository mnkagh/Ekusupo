/**
 * What the dashboard knows about each provider, independent of whether
 * the user has connected it.
 *
 * `availability` is stated honestly per provider rather than showing
 * everything as connectable: a tile that offers to connect something the
 * backend cannot yet talk to is a lie the user only discovers after
 * clicking. `planned` tiles are visible because the destination half of
 * the product is the point — hiding them would misrepresent the roadmap
 * — but they never present an action that would fail.
 */
export interface ProviderDescriptor {
  id: string;
  name: string;
  /** Short, factual capability line. No marketing. */
  capability: string;
  availability: "available" | "planned";
  /** Two brand-adjacent stops used only for that tile's own accent. */
  accent: [string, string];
  /** Drawn as an inline SVG path so no external icon dependency is needed. */
  glyph: "wave" | "note" | "play" | "file";
}

export const PROVIDER_CATALOG: ProviderDescriptor[] = [
  {
    id: "spotify",
    name: "Spotify",
    capability: "Public playlists work without an account",
    availability: "available",
    accent: ["#1ed760", "#34e0d0"],
    glyph: "wave",
  },
  {
    id: "apple-music",
    name: "Apple Music",
    capability: "Connector in progress",
    availability: "planned",
    accent: ["#fa2f56", "#ff7a8a"],
    glyph: "note",
  },
  {
    id: "youtube-music",
    name: "YouTube Music",
    capability: "Connector in progress",
    availability: "planned",
    accent: ["#ff0033", "#ffb26b"],
    glyph: "play",
  },
  {
    id: "upf-file",
    name: "UPF File",
    capability: "Export and import without an account",
    availability: "planned",
    accent: ["#34e0d0", "#ffb26b"],
    glyph: "file",
  },
];
