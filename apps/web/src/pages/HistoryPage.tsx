import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

export function HistoryPage() {
  const { data, isLoading, error } = useQuery({ queryKey: ['history'], queryFn: api.history });

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
