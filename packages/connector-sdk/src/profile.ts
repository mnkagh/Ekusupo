/**
 * Account identity, not music library data — deliberately not a UPF
 * concept (UPF's scope is playlists/tracks/albums/artists).
 */
export interface ProviderProfile {
  id: string;
  displayName?: string;
  email?: string;
}
