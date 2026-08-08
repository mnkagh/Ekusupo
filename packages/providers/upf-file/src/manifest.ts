import type { ProviderCapability, ProviderManifest } from "@ekusupo/connector-sdk";

/**
 * Deliberately no `tracks.search` — a UPF file has no catalog to search
 * against, and honestly declaring that (rather than faking a search) is
 * what correctly keeps this connector out of Live Transfer's match-based
 * write path today. See ADR-0016 and README.md.
 */
const supportedCapabilities: ReadonlySet<ProviderCapability> = new Set([
  "playlists.read",
  "playlists.create",
  "playlists.addTracks",
]);

export const upfFileManifest: ProviderManifest = {
  name: "upf-file",
  displayName: "UPF File",
  version: "0.0.0",
  authenticationMethods: ["none"],
  supportedCapabilities,
  documentation: "https://github.com/mnkagh/Ekusupo/blob/main/docs/universal-playlist-format.md",
};
