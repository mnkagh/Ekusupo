import type { Artwork } from "./artwork.js";
import type { ProviderRefs } from "./provider-ref.js";

/**
 * No `externalIds` here — ISRC/UPC identify recordings/releases, not
 * artists.
 */
export interface Artist {
  id: string;
  name: string;
  providerRefs?: ProviderRefs;
  images?: Artwork;
}
