import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api, TransferReport } from '../lib/api';

export function ExportPage() {
  const { data: providers } = useQuery({ queryKey: ['providers'], queryFn: api.providers });
  const { data: playlists } = useQuery({ queryKey: ['playlists'], queryFn: api.playlists });
  const [source, setSource] = useState('demo');
  const [destination, setDestination] = useState('internet-archive');
  const [playlistId, setPlaylistId] = useState('');
  const [report, setReport] = useState<TransferReport | null>(null);
  const mutation = useMutation({
    mutationFn: api.transferPreview,
    onSuccess: (result) => setReport(result),
  });

  return (
    <div>
      <h1>Export and transfer</h1>
      <div className="card" style={{ display: 'grid', gap: 12, marginTop: 24, maxWidth: 720 }}>
        <label>
          Source provider
          <select value={source} onChange={(event) => setSource(event.target.value)}>
            {providers?.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Destination provider
          <select value={destination} onChange={(event) => setDestination(event.target.value)}>
            {providers?.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Playlist
          <select value={playlistId} onChange={(event) => setPlaylistId(event.target.value)}>
            <option value="">None</option>
            {playlists?.map((playlist) => (
              <option key={playlist.id} value={playlist.id}>
                {playlist.name}
              </option>
            ))}
          </select>
        </label>
        <button
          onClick={() =>
            mutation.mutate({
              sourceProvider: source,
              destinationProvider: destination,
              playlistId: playlistId || undefined,
            })
          }
        >
          Run dry-run preview
        </button>
      </div>
      {mutation.isPending && <p>Calculating match preview…</p>}
      {report && (
        <div className="card" style={{ marginTop: 24 }}>
          <strong>Preview report</strong>
          <p>
            Matched: {report.matched} · Unmatched: {report.unmatched}
          </p>
          <p style={{ color: 'var(--foreground-secondary)', fontSize: 14 }}>
            Dry run only. No data has been written to the destination.
          </p>
        </div>
      )}
    </div>
  );
}
