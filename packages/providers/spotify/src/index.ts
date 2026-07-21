// Deliberately does NOT export types.ts (Spotify-native shapes) or
// normalize.ts (internal conversion functions) — see ADR-0004, decision 1.
// Consumers only ever see MusicProvider + UPF types.
export { spotifyManifest } from "./manifest.js";
export { createSpotifyProvider } from "./provider.js";
export type { SpotifyProviderConfig } from "./provider.js";
