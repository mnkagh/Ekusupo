export interface ArtworkImage {
  url: string;
  width?: number;
  height?: number;
}

/** An array, not a single image, to hold multiple resolutions when a provider exposes them. */
export type Artwork = ArtworkImage[];
