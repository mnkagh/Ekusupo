import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api, ExportDocument } from '../lib/api';
import { useAuth } from '../features/auth/useAuth';
import { useGuestStore } from '../features/guest/guestStore';

export function ExportPage() {
  const { isGuest } = useAuth();
  const guestPlaylists = useGuestStore((state) => state.playlists);
  const createGuestPlaylist = useGuestStore((state) => state.createPlaylist);
  const addGuestTrack = useGuestStore((state) => state.addTrackToPlaylist);
  const { data: providers } = useQuery({ queryKey: ['providers'], queryFn: api.providers });
  const { data: playlists } = useQuery({ queryKey: ['playlists'], queryFn: api.playlists });
  const { data: library } = useQuery({ queryKey: ['library'], queryFn: api.library });
  const [source, setSource] = useState('demo');
  const [destination, setDestination] = useState('demo');
  const [playlistId, setPlaylistId] = useState('');
  const [report, setReport] = useState<string | null>(null);
  const [upfText, setUpfText] = useState('');

  const previewMutation = useMutation({
    mutationFn: api.transferPreview,
    onSuccess: (result) =>
      setReport(`Dry run: ${result.matched} matched, ${result.unmatched} unmatched.`),
  });

  const executeMutation = useMutation({
    mutationFn: async () => {
      if (isGuest) {
        if (destination !== 'demo') {
          throw new Error(
            'Live transfer to external providers requires an Ekusupo account. Demo-to-demo transfer works in guest mode.',
          );
        }
        const sourceTracks = playlistId
          ? (guestPlaylists.find((playlist) => playlist.id === playlistId)?.trackIds ?? [])
          : (library?.tracks.map((track) => track.id) ?? []);
        const newPlaylistId = createGuestPlaylist(`Transferred: ${source} to ${destination}`);
        for (const trackId of sourceTracks) addGuestTrack(newPlaylistId, trackId);
        return { destinationPlaylistId: newPlaylistId, matched: sourceTracks.length };
      }

      const response = await fetch('/api/transfers/execute', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceProvider: source,
          destinationProvider: destination,
          playlistId: playlistId || undefined,
        }),
      });
      if (!response.ok) throw new Error(await response.text());
      return response.json();
    },
    onSuccess: (result) =>
      setReport(
        `Live transfer complete: ${result.matched} tracks copied to playlist ${result.destinationPlaylistId}.`,
      ),
    onError: (error) => setReport(String(error)),
  });

  const importMutation = useMutation({
    mutationFn: async () => {
      const document = JSON.parse(upfText) as ExportDocument;
      if (isGuest) {
        const newPlaylistId = createGuestPlaylist(document.playlist.name);
        for (const trackId of document.playlist.trackIds) addGuestTrack(newPlaylistId, trackId);
        return { name: document.playlist.name, trackIds: document.playlist.trackIds };
      }

      const response = await fetch('/api/transfers/import', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document }),
      });
      if (!response.ok) throw new Error(await response.text());
      return response.json();
    },
    onSuccess: (result) =>
      setReport(`Imported playlist ${result.name} (${result.trackIds.length} tracks).`),
    onError: (error) => setReport(String(error)),
  });

  const availablePlaylists = isGuest ? guestPlaylists : (playlists ?? []);

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
            <option value="">Source provider tracks</option>
            {availablePlaylists.map((playlist) => (
              <option key={playlist.id} value={playlist.id}>
                {playlist.name}
              </option>
            ))}
          </select>
        </label>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button
            onClick={() =>
              previewMutation.mutate({
                sourceProvider: source,
                destinationProvider: destination,
                playlistId: playlistId || undefined,
              })
            }
          >
            Run dry-run preview
          </button>
          <button onClick={() => executeMutation.mutate()}>Run live transfer</button>
        </div>
      </div>

      <div className="card" style={{ display: 'grid', gap: 12, marginTop: 24, maxWidth: 720 }}>
        <h2>Import UPF</h2>
        <textarea
          value={upfText}
          onChange={(event) => setUpfText(event.target.value)}
          rows={8}
          placeholder="Paste a UPF document"
        />
        <button onClick={() => importMutation.mutate()}>Import</button>
      </div>

      {(previewMutation.isPending || executeMutation.isPending || importMutation.isPending) && (
        <p>Working…</p>
      )}
      {report && (
        <div className="card" style={{ marginTop: 24 }}>
          <p>{report}</p>
        </div>
      )}
    </div>
  );
}
