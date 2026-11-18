/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef } from 'react';
import { usePlayer } from '../../features/playback/usePlayer';
import type { Track } from '../../features/playback/types';

declare global {
  interface Window {
    YT?: {
      Player: new (element: string | HTMLElement, config: any) => any;
      PlayerState: { PLAYING: number; PAUSED: number; ENDED: number };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

function extractId(url: string) {
  const match = url.match(/(?:v=|youtu\.be\/|embed\/)([A-Za-z0-9_-]{11})/);
  return match?.[1];
}

function isYouTube(url?: string) {
  return Boolean(url?.includes('youtube.com/embed'));
}

function isDirectVideo(url?: string) {
  return Boolean(url && /\.(mp4|webm|ogg)(\?|$)/i.test(url));
}

export function VideoPlayer({ track }: { track: Track | null }) {
  const player = usePlayer();
  const youtubeRef = useRef<any>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerId = `youtube-player-${track?.id?.replace(/[^a-zA-Z0-9_-]/g, '') ?? 'current'}`;

  useEffect(() => {
    if (!track?.mediaUrl || !isYouTube(track.mediaUrl)) {
      player.registerVideoController(null);
      if (track?.mediaType === 'video' && videoRef.current) {
        const video = videoRef.current;
        const controller = {
          play: () => video.play(),
          pause: () => video.pause(),
          seek: (seconds: number) => {
            video.currentTime = seconds;
          },
          getCurrentTime: () => video.currentTime || 0,
          getDuration: () => video.duration || 0,
          setVolume: (value: number) => {
            video.volume = value;
          },
        };
        player.registerVideoController(controller);
      }
      return () => {
        videoRef.current?.pause();
        player.registerVideoController(null);
      };
    }

    const videoId = extractId(track.mediaUrl);
    if (!videoId) return;

    let destroyed = false;

    const createPlayer = () => {
      if (destroyed || !window.YT?.Player || !document.getElementById(containerId)) return;
      const ytPlayer = new window.YT.Player(containerId, {
        videoId,
        playerVars: {
          autoplay: 0,
          controls: 1,
          enablejsapi: 1,
          origin: window.location.origin,
          rel: 0,
        },
        events: {
          onReady: () => {
            const controller = {
              play: () => ytPlayer.playVideo(),
              pause: () => ytPlayer.pauseVideo(),
              seek: (seconds: number) => ytPlayer.seekTo(seconds, true),
              getCurrentTime: () => ytPlayer.getCurrentTime?.() ?? 0,
              getDuration: () => ytPlayer.getDuration?.() ?? 0,
              setVolume: (value: number) => ytPlayer.setVolume?.(Math.round(value * 100)),
            };
            player.registerVideoController(controller);
            if (player.isPlaying) ytPlayer.playVideo();
          },
          onStateChange: (event: any) => {
            if (event.data === window.YT?.PlayerState.PLAYING) player.setPlaying(true);
            if (event.data === window.YT?.PlayerState.PAUSED) player.setPlaying(false);
            if (event.data === window.YT?.PlayerState.ENDED) {
              player.setPlaying(false);
              player.next();
            }
          },
        },
      });
      youtubeRef.current = ytPlayer;
    };

    if (!window.YT) {
      window.onYouTubeIframeAPIReady = createPlayer;
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(script);
    } else {
      createPlayer();
    }

    return () => {
      destroyed = true;
      youtubeRef.current?.pauseVideo?.();
      youtubeRef.current?.destroy?.();
      player.registerVideoController(null);
    };
  }, [track?.id, track?.mediaUrl, containerId, player]);

  if (!track?.mediaUrl) return <p>No video source for this track.</p>;

  if (isYouTube(track.mediaUrl)) {
    return <div id={containerId} style={{ width: '100%', minHeight: 420, borderRadius: 12 }} />;
  }

  if (isDirectVideo(track.mediaUrl)) {
    return (
      <video
        ref={videoRef}
        src={track.mediaUrl}
        controls
        onPlay={() => player.setPlaying(true)}
        onPause={() => player.setPlaying(false)}
        onEnded={() => {
          player.setPlaying(false);
          player.next();
        }}
        style={{ width: '100%', borderRadius: 12 }}
      />
    );
  }

  return (
    <p style={{ color: 'var(--foreground-secondary)' }}>
      This provider does not expose a direct video source.
    </p>
  );
}
