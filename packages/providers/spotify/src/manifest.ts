import type { ProviderCapability, ProviderManifest } from "@ekusupo/connector-sdk";

/**
 * Standalone, importable without constructing a provider instance — see
 * docs/connector-sdk.md#how-is-a-provider-described-before-its-even-instantiated.
 *
 * `supportedCapabilities` matches exactly what this reference
 * implementation currently does (read-only) — not Spotify's full real-world
 * API surface. This package is explicitly not production-ready
 * (see README.md), so overclaiming capabilities here would be dishonest.
 */
const supportedCapabilities: ReadonlySet<ProviderCapability> = new Set([
  "profile.read",
  "playlists.read",
]);

export const spotifyManifest: ProviderManifest = {
  name: "spotify",
  displayName: "Spotify",
  version: "0.0.0",
  authenticationMethods: ["oauth2"],
  supportedCapabilities,
  website: "https://www.spotify.com",
  documentation: "https://developer.spotify.com/documentation/web-api",
  icon: "https://open.spotify.com/favicon.ico",
};
