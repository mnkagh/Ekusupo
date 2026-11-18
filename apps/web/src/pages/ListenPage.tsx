import { useMutation, useQuery } from '@tanstack/react-query';
import { api, TrackDto } from '../lib/api';
import { useAuth } from '../features/auth/useAuth';
import { useGuestStore } from '../features/guest/guestStore';
import { usePlayer } from '../features/playback/usePlayer';
import { toTrack } from '../lib/track';

export function ListenPage() {
  const { data, isLoading, error } = useQuery({ queryKey: ['library'], queryFn: api.library });
  const { isGuest } = useAuth();
  const player = usePlayer();
  const recordHistory = useMutation({ mutationFn: api.recordHistory });
  const recordGuestHistory = useGuestStore((state) => state.recordHistory);

  return (
    <div>
      <h1>Listen</h1>
      <p style={{ color: 'var(--foreground-secondary)' }}>
        Your unified library and demo tracks. Demo content is labeled.
      </p>
      {isLoading && <p>Loading library…</p>}
      {error && <p style={{ color: 'var(--danger)' }}>{String(error)}</p>}
      <div style={{ display: 'grid', gap: 12, marginTop: 24 }}>
        {data?.tracks.map((track) => (
          <TrackRow
            key={track.id}
            track={track}
            onPlay={() => {
              player.playTrack(toTrack(track), data.tracks.map(toTrack));
              if (isGuest) recordGuestHistory(track);
              else recordHistory.mutate(track.id);
            }}
          />
        ))}
      </div>
      {!isLoading && !data?.tracks.length && <p>No tracks available.</p>}
    </div>
  );
}

function TrackRow({ track, onPlay }: { track: TrackDto; onPlay: () => void }) {
  return (
    <div
      className="card"
      style={{
        display: 'grid',
        gridTemplateColumns: '56px 1fr auto',
        gap: 16,
        alignItems: 'center',
      }}
    >
      <div className="vinyl" style={{ width: 56, height: 56 }} />
      <div>
        <strong>{track.title}</strong>
        <div style={{ color: 'var(--foreground-secondary)', fontSize: 14 }}>
          {track.artist} · {track.provider} · {track.source}
        </div>
      </div>
      <button disabled={!track.mediaUrl} onClick={onPlay}>
        {track.mediaUrl ? 'Play' : 'No media'}
      </button>
    </div>
  );
}
