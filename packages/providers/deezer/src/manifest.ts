import type { ProviderManifest } from "@ekusupo/connector-sdk";

/**
 * Deezer's public catalogue needs no account at all — playlist reads
 * and search are anonymous. That makes this the first connector whose
 * authenticationMethods is just ["none"], proving the SDK never assumed
 * a login.
 */
export const deezerManifest: ProviderManifest = {
  name: "deezer",
  displayName: "Deezer",
  version: "0.1.0",
  authenticationMethods: ["none"],
  supportedCapabilities: new Set(["playlists.read", "tracks.search"]),
  website: "https://www.deezer.com",
  documentation: "https://developers.deezer.com/api",
};

export const DEEZER_API_BASE = "https://api.deezer.com";
