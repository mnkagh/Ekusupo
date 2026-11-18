import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { TrackDto } from '../../lib/api';

export interface GuestHistoryEntry {
  id: string;
  track: TrackDto;
  playedAt: string;
}

export interface GuestPlaylist {
  id: string;
  name: string;
  trackIds: string[];
}

interface GuestState {
  library: TrackDto[];
  history: GuestHistoryEntry[];
  playlists: GuestPlaylist[];
  addToLibrary: (track: TrackDto) => void;
  removeFromLibrary: (trackId: string) => void;
  recordHistory: (track: TrackDto) => void;
  createPlaylist: (name: string) => string;
  addTrackToPlaylist: (playlistId: string, trackId: string) => void;
}

export const useGuestStore = create<GuestState>()(
  persist(
    (set) => ({
      library: [],
      history: [],
      playlists: [],
      addToLibrary: (track) =>
        set((state) =>
          state.library.some((item) => item.id === track.id)
            ? state
            : { library: [track, ...state.library] },
        ),
      removeFromLibrary: (trackId) =>
        set((state) => ({ library: state.library.filter((track) => track.id !== trackId) })),
      recordHistory: (track) =>
        set((state) => ({
          history: [
            { id: crypto.randomUUID(), track, playedAt: new Date().toISOString() },
            ...state.history,
          ].slice(0, 100),
        })),
      createPlaylist: (name) => {
        const id = crypto.randomUUID();
        set((state) => ({ playlists: [{ id, name, trackIds: [] }, ...state.playlists] }));
        return id;
      },
      addTrackToPlaylist: (playlistId, trackId) =>
        set((state) => ({
          playlists: state.playlists.map((playlist) =>
            playlist.id === playlistId && !playlist.trackIds.includes(trackId)
              ? { ...playlist, trackIds: [...playlist.trackIds, trackId] }
              : playlist,
          ),
        })),
    }),
    { name: 'ekusupo-guest' },
  ),
);
