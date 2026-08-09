import type { ProviderCapability, ProviderManifest } from "@ekusupo/connector-sdk";

/**
 * Read plus catalog search — one capability more than Spotify's
 * connector, and the reason this provider matters to the product: with
 * `tracks.search` a Dry Run can actually match tracks against a real
 * destination catalogue instead of reporting "cannot search" (ADR-0011).
 *
 * Deliberately excludes `playlists.create` / `playlists.addTracks`.
 * Apple Music can do both, but this connector does not implement them
 * yet, and the manifest describes what the code does rather than what
 * the vendor's API offers — the same honesty rule the Spotify connector
 * follows.
 */
const supportedCapabilities: ReadonlySet<ProviderCapability> = new Set([
  "profile.read",
  "playlists.read",
  "tracks.search",
]);

export const appleMusicManifest: ProviderManifest = {
  name: "apple-music",
  displayName: "Apple Music",
  version: "0.0.0",
  authenticationMethods: ["oauth2"],
  supportedCapabilities,
  website: "https://music.apple.com",
  documentation: "https://developer.apple.com/documentation/applemusicapi",
  icon: "https://music.apple.com/favicon.ico",
};
