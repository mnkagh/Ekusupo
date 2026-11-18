import type { Track } from '../../features/playback/types';

function isYouTube(url?: string) {
  return Boolean(url?.includes('youtube.com/embed'));
}

function isDirectVideo(url?: string) {
  return Boolean(url && /\.(mp4|webm|ogg)(\?|$)/i.test(url));
}

export function VideoPlayer({ track }: { track: Track | null }) {
  if (!track?.mediaUrl) return <p>No video source for this track.</p>;

  if (isYouTube(track.mediaUrl)) {
    return (
      <iframe
        title={track.title}
        src={track.mediaUrl}
        width="100%"
        height="420"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        style={{ border: 0, borderRadius: 12 }}
      />
    );
  }

  if (isDirectVideo(track.mediaUrl)) {
    return <video src={track.mediaUrl} controls style={{ width: '100%', borderRadius: 12 }} />;
  }

  return (
    <p style={{ color: 'var(--foreground-secondary)' }}>
      This provider does not expose a direct video source in demo mode.
    </p>
  );
}
