import type { Artist } from "./artist.js";
import type { Artwork } from "./artwork.js";
import type { ExternalIds } from "./external-ids.js";
import type { ProviderRefs } from "./provider-ref.js";

export interface Album {
  id: string;
  title: string;
  /** Ordered; supports various-artists releases. */
  artists: Artist[];
  /** ISO 8601 date; precision varies by provider (year-only, year-month, or full date). */
  releaseDate?: string;
  /** Typically `upc` or `ean`. */
  externalIds?: ExternalIds;
  providerRefs?: ProviderRefs;
  artwork?: Artwork;
  totalTracks?: number;
}
