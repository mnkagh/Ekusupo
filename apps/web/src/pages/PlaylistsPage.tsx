import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

export function PlaylistsPage() {
  const queryClient = useQueryClient();
  const { data: playlists, isLoading } = useQuery({
    queryKey: ['playlists'],
    queryFn: api.playlists,
  });
  const { data: library } = useQuery({ queryKey: ['library'], queryFn: api.library });
  const [name, setName] = useState('');
  const createMutation = useMutation({
    mutationFn: api.createPlaylist,
    onSuccess: () => {
      setName('');
      queryClient.invalidateQueries({ queryKey: ['playlists'] });
    },
  });
  const addMutation = useMutation({
    mutationFn: ({ playlistId, trackId }: { playlistId: string; trackId: string }) =>
      api.addPlaylistTrack(playlistId, trackId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['playlists'] }),
  });

  return (
    <div>
      <h1>Playlists</h1>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (name.trim()) createMutation.mutate(name.trim());
        }}
        style={{ display: 'flex', gap: 12, marginTop: 20 }}
      >
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="New playlist name"
        />
        <button type="submit">Create</button>
      </form>
      {isLoading && <p>Loading playlists…</p>}
      <div style={{ display: 'grid', gap: 12, marginTop: 24 }}>
        {playlists?.map((playlist) => (
          <div key={playlist.id} className="card">
            <strong>{playlist.name}</strong>
            <div style={{ color: 'var(--foreground-secondary)', fontSize: 14, marginTop: 8 }}>
              {playlist.trackIds.length} tracks
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
              {library?.tracks.slice(0, 3).map((track) => (
                <button
                  key={track.id}
                  onClick={() => addMutation.mutate({ playlistId: playlist.id, trackId: track.id })}
                >
                  Add {track.title}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      {!isLoading && !playlists?.length && <p>No playlists yet.</p>}
    </div>
  );
}
