import type { MusicProvider } from "@ekusupo/connector-sdk";

/**
 * The destination id meaning "a UPF document I can download", as opposed
 * to a provider slug from the registry. Deliberately not a registry
 * entry: there is no account to connect, no credentials to configure, and
 * nothing for `GET /providers/catalog` to report as configured or not.
 */
export const UPF_DESTINATION_ID = "upf";

/**
 * Why a destination cannot be written to, phrased for the person who has
 * to do something about it — or `undefined` if it can.
 *
 * Checked before the transfer starts rather than left to
 * `runLiveTransfer`, which would fail the job with a generic "cannot
 * create or populate playlists" only after the source read had already
 * happened. Same information, but arriving before the work instead of
 * after it, and naming the provider.
 */
export function describeWriteLimitation(provider: MusicProvider): string | undefined {
  const supports = provider.getCapabilities().supports;
  const canCreate = supports.has("playlists.create") && provider.createPlaylist !== undefined;
  const canAdd = supports.has("playlists.addTracks") && provider.addTracksToPlaylist !== undefined;

  if (canCreate && canAdd) return undefined;

  return `${provider.manifest.displayName} cannot be a Live Transfer destination: its API does not let Ekusupo create playlists or add tracks. Choose a different destination, or export to a UPF file instead.`;
}
