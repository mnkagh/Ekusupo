import { useQuery } from '@tanstack/react-query';
import type { Track } from '../../features/playback/types';

export function LyricsPanel({ track, progress }: { track: Track | null; progress: number }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['lyrics', track?.id],
    queryFn: async () => {
      if (!track) return null;
      const params = new URLSearchParams({
        artist: track.artist,
        title: track.title,
      });
      if (track.durationMs) params.set('duration', String(Math.round(track.durationMs / 1000)));
      const response = await fetch(`/api/lyrics?${params.toString()}`);
      if (!response.ok) throw new Error('Lyrics not available');
      return response.json() as Promise<{
        lines: Array<{ time: number; text: string }>;
        plain?: string;
      }>;
    },
    enabled: Boolean(track),
    retry: false,
  });

  if (!track) return <p>Select a track to view lyrics.</p>;
  if (isLoading) return <p>Loading lyrics…</p>;
  if (error)
    return (
      <p style={{ color: 'var(--foreground-secondary)' }}>
        Lyrics are not available for this track.
      </p>
    );

  const activeIndex =
    data?.lines.reduce(
      (index, line, lineIndex) => (line.time <= progress ? lineIndex : index),
      -1,
    ) ?? -1;

  return (
    <div style={{ display: 'grid', gap: 8, maxHeight: '60vh', overflow: 'auto' }}>
      {data?.lines.map((line, index) => (
        <p
          key={`${line.time}-${index}`}
          style={{
            margin: 0,
            color: index === activeIndex ? 'var(--foreground)' : 'var(--foreground-muted)',
            fontWeight: index === activeIndex ? 600 : 400,
          }}
        >
          {line.text}
        </p>
      ))}
      {!data?.lines.length && data?.plain && (
        <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>{data.plain}</pre>
      )}
    </div>
  );
}
