import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

export function ProvidersPage() {
  const { data, isLoading, error } = useQuery({ queryKey: ['providers'], queryFn: api.providers });

  return (
    <div>
      <h1>Providers</h1>
      <p style={{ color: 'var(--foreground-secondary)' }}>
        Statuses reflect actual configuration and implementation state.
      </p>
      {isLoading && <p>Loading providers…</p>}
      {error && <p style={{ color: 'var(--danger)' }}>{String(error)}</p>}
      <div style={{ display: 'grid', gap: 12, marginTop: 24 }}>
        {data?.map((provider) => (
          <div key={provider.id} className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
              <strong>{provider.name}</strong>
              <span className="pixel-frame" style={{ padding: '4px 8px', fontSize: 12 }}>
                {provider.status}
              </span>
            </div>
            <p style={{ color: 'var(--foreground-secondary)', fontSize: 14, marginTop: 10 }}>
              {provider.description}
            </p>
            <div style={{ color: 'var(--foreground-muted)', fontSize: 13, marginTop: 8 }}>
              Capabilities: {provider.capabilities.join(', ') || 'none'}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
