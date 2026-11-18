import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../features/auth/useAuth';
import { useGuestStore } from '../features/guest/guestStore';

export function HistoryPage() {
  const { isGuest } = useAuth();
  const guestHistory = useGuestStore((state) => state.history);
  const { data, isLoading, error } = useQuery({
    queryKey: ['history'],
    queryFn: api.history,
    enabled: !isGuest,
  });

  if (isGuest) {
    return (
      <div>
        <h1>History</h1>
        <div style={{ display: 'grid', gap: 12, marginTop: 24 }}>
          {guestHistory.map((entry) => (
            <div key={entry.id} className="card">
              <strong>{entry.track.title}</strong>
              <div style={{ color: 'var(--foreground-secondary)', fontSize: 14 }}>
                {entry.track.artist} · {new Date(entry.playedAt).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
        {!guestHistory.length && <p>No listening history yet.</p>}
      </div>
    );
  }

  return (
    <div>
      <h1>History</h1>
      {isLoading && <p>Loading history…</p>}
      {error && <p style={{ color: 'var(--danger)' }}>{String(error)}</p>}
      <div style={{ display: 'grid', gap: 12, marginTop: 24 }}>
        {data?.map((entry) => (
          <div key={entry.id} className="card">
            <strong>{entry.track.title}</strong>
            <div style={{ color: 'var(--foreground-secondary)', fontSize: 14 }}>
              {entry.track.artist} · {new Date(entry.playedAt).toLocaleString()}
            </div>
          </div>
        ))}
      </div>
      {!isLoading && !data?.length && <p>No listening history yet.</p>}
    </div>
  );
}
