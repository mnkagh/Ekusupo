import type { ProviderCapability, ProviderManifest } from "@ekusupo/connector-sdk";

/**
 * Backed by the **YouTube Data API v3**, not by YouTube Music's private
 * internal API. YouTube Music has no official public API; the supported
 * surface is YouTube's, where a "YouTube Music playlist" is an ordinary
 * YouTube playlist of music videos. That is a real constraint on
 * fidelity and it is recorded here rather than glossed over — see
 * README.md.
 *
 * Declares write capabilities, which no other connector in this repo
 * does: the Data API genuinely supports creating a playlist and
 * inserting items, so this is the first provider that can be a *real*
 * destination for a Live Transfer.
 */
const supportedCapabilities: ReadonlySet<ProviderCapability> = new Set([
  "profile.read",
  "playlists.read",
  "playlists.create",
  "playlists.addTracks",
  "tracks.search",
]);

export const youtubeMusicManifest: ProviderManifest = {
  name: "youtube-music",
  displayName: "YouTube Music",
  version: "0.0.0",
  authenticationMethods: ["oauth2"],
  supportedCapabilities,
  website: "https://music.youtube.com",
  documentation: "https://developers.google.com/youtube/v3/docs",
  icon: "https://music.youtube.com/favicon.ico",
};
