import type { PlaylistPrivacy, Track } from "@ekusupo/upf";

export interface CreatePlaylistInput {
  title: string;
  description?: string;
  tracks?: Track[];
  privacy?: PlaylistPrivacy;
}

export interface UpdatePlaylistInput {
  title?: string;
  description?: string;
  privacy?: PlaylistPrivacy;
}
