import { useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { usePlayer } from '../features/playback/usePlayer';
import { toTrack } from '../lib/track';

export function SearchPage() {
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [provider, setProvider] = useState('all');
  const { data: providers } = useQuery({ queryKey: ['providers'], queryFn: api.providers });
  const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      queryKey: ['search', submitted, provider],
      queryFn: ({ pageParam }) => api.search(submitted, provider, pageParam as number),
      enabled: submitted.length > 0,
      initialPageParam: 0,
      getNextPageParam: (lastPage) => lastPage.nextOffset,
    });
  const results = data?.pages.flatMap((page) => page.results) ?? [];
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
          <option value="youtube-music">YouTube</option>
          <option value="soundcloud">SoundCloud</option>
          <option value="spotify">Spotify</option>
          <option value="internet-archive">Internet Archive</option>
          <option value="deezer">Deezer</option>
        </select>
        <button type="submit">Search</button>
      </form>
      {providers?.find((item) => item.id === provider)?.status === 'requires_configuration' && (
        <p style={{ color: 'var(--warning)' }}>
          {providers.find((item) => item.id === provider)?.name} search requires server
          configuration. Configure it in apps/api/.env and restart the API.
        </p>
      )}
      {isLoading && <p>Searching…</p>}
      {error && <p style={{ color: 'var(--danger)' }}>{String(error)}</p>}
      <div style={{ display: 'grid', gap: 12, marginTop: 24 }}>
        {results.map((track) => (
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
              onClick={() => player.playTrack(toTrack(track), results.map(toTrack))}
            >
              {track.mediaUrl ? 'Play' : 'No media'}
            </button>
          </div>
        ))}
      </div>
      {hasNextPage && (
        <button
          onClick={() => fetchNextPage()}
          disabled={isFetchingNextPage}
          style={{ marginTop: 16 }}
        >
          {isFetchingNextPage ? 'Loading…' : 'See more'}
        </button>
      )}
      {submitted && !isLoading && !results.length && <p>No results.</p>}
    </div>
  );
}
