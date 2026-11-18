import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../features/auth/useAuth';
import { useGuestStore } from '../features/guest/guestStore';
import { usePlayer } from '../features/playback/usePlayer';
import { toTrack } from '../lib/track';

export function LibraryPage() {
  const queryClient = useQueryClient();
  const { isGuest } = useAuth();
  const guestLibrary = useGuestStore((state) => state.library);
  const addToGuestLibrary = useGuestStore((state) => state.addToLibrary);
  const { data, isLoading, error } = useQuery({ queryKey: ['library'], queryFn: api.library });
  const player = usePlayer();
  const addMutation = useMutation({
    mutationFn: api.addLibrary,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['library'] }),
  });

  const tracks = data
    ? [
        ...guestLibrary.filter(
          (guestTrack) => !data.tracks.some((track) => track.id === guestTrack.id),
        ),
        ...data.tracks,
      ]
    : guestLibrary;

  return (
    <div>
      <h1>Library</h1>
      <p style={{ color: 'var(--foreground-secondary)' }}>
        Tracks persisted for the current session and demo library.
      </p>
      {isLoading && <p>Loading library…</p>}
      {error && <p style={{ color: 'var(--danger)' }}>{String(error)}</p>}
      <div style={{ display: 'grid', gap: 12, marginTop: 24 }}>
        {tracks.map((track) => (
          <div
            key={track.id}
            className="card"
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr auto auto',
              gap: 12,
              alignItems: 'center',
            }}
          >
            <div>
              <strong>{track.title}</strong>
              <div style={{ color: 'var(--foreground-secondary)', fontSize: 14 }}>
                {track.artist} · {track.provider} · {track.source}
              </div>
            </div>
            <button onClick={() => player.playTrack(toTrack(track), tracks.map(toTrack))}>
              Play
            </button>
            <button
              onClick={() => (isGuest ? addToGuestLibrary(track) : addMutation.mutate(track.id))}
            >
              Save
            </button>
          </div>
        ))}
      </div>
      {!isLoading && !tracks.length && <p>Your library is empty.</p>}
    </div>
  );
}
