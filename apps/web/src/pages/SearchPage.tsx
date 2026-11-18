import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { usePlayer } from '../features/playback/usePlayer';
import { toTrack } from '../lib/track';
import type { Track } from '../features/playback/types';

export function SearchPage() {
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [provider, setProvider] = useState('all');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const { data, isLoading, error } = useQuery({
    queryKey: ['search', submitted, provider],
    queryFn: () => api.search(submitted, provider),
    enabled: submitted.length > 0,
  });
  const player = usePlayer();

  return (
    <div>
      <h1>Search</h1>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setSubmitted(query.trim());
        }}
        style={{ display: 'flex', gap: 12, marginTop: 20, flexWrap: 'wrap' }}
      >
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search tracks, artists, albums"
          style={{ flex: 1, minWidth: 240 }}
        />
        <select value={provider} onChange={(event) => setProvider(event.target.value)}>
          <option value="all">All providers</option>
          <option value="demo">Demo</option>
          <option value="internet-archive">Internet Archive</option>
          <option value="deezer">Deezer</option>
        </select>
        <button type="submit">Search</button>
      </form>
      {isLoading && <p>Searching…</p>}
      {error && <p style={{ color: 'var(--danger)' }}>{String(error)}</p>}
      <div style={{ display: 'grid', gap: 12, marginTop: 24 }}>
        {data?.results.map((track) => (
          <div
            key={track.id}
            className="card"
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr auto',
              gap: 16,
              alignItems: 'center',
            }}
          >
            <div>
              <strong>{track.title}</strong>
              <div style={{ color: 'var(--foreground-secondary)', fontSize: 14 }}>
                {track.artist} · {track.provider} · {track.source}
              </div>
            </div>
            <button
              disabled={!track.mediaUrl}
              onClick={() => player.playTrack(toTrack(track), data.results.map(toTrack))}
            >
              {track.mediaUrl ? 'Play' : 'No media'}
            </button>
          </div>
        ))}
      </div>
      <div className="card" style={{ marginTop: 24, maxWidth: 720 }}>
        <h2>Play a YouTube video</h2>
        <p style={{ color: 'var(--foreground-secondary)', fontSize: 14 }}>
          Paste a public YouTube URL or video ID. Playback uses YouTube's embedded player and does
          not require an Ekusupo account.
        </p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const match = youtubeUrl.match(/(?:v=|youtu\.be\/|embed\/)([A-Za-z0-9_-]{11})/);
            const id = match?.[1] ?? (youtubeUrl.trim().length === 11 ? youtubeUrl.trim() : null);
            if (!id) return;
            const track: Track = {
              id: `youtube:${id}`,
              title: `YouTube video ${id}`,
              artist: 'YouTube',
              durationMs: 0,
              mediaUrl: `https://www.youtube.com/embed/${id}?enablejsapi=1`,
              mediaType: 'video',
              provider: 'youtube-music',
              source: 'live',
            };
            player.playTrack(track);
            setYoutubeUrl('');
          }}
          style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}
        >
          <input
            value={youtubeUrl}
            onChange={(event) => setYoutubeUrl(event.target.value)}
            placeholder="https://www.youtube.com/watch?v=..."
            style={{ flex: 1, minWidth: 240 }}
          />
          <button type="submit">Play video</button>
        </form>
      </div>
      {submitted && !isLoading && !data?.results.length && <p>No results.</p>}
    </div>
  );
}
