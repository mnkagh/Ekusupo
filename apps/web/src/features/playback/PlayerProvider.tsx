import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Track } from './types';

interface PlayerContextValue {
  queue: Track[];
  currentTrack: Track | null;
  currentIndex: number;
  isPlaying: boolean;
  progress: number;
  duration: number;
  volume: number;
  setQueue: (tracks: Track[], startIndex?: number) => void;
  playTrack: (track: Track, queue?: Track[]) => void;
  togglePlay: () => void;
  next: () => void;
  previous: () => void;
  seek: (seconds: number) => void;
  setVolume: (value: number) => void;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [queue, setQueueState] = useState<Track[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(0.75);
  const [hydrated, setHydrated] = useState(false);

  const currentTrack = currentIndex >= 0 ? (queue[currentIndex] ?? null) : null;

  useEffect(() => {
    try {
      const raw = localStorage.getItem('ekusupo-player');
      if (raw) {
        const saved = JSON.parse(raw) as {
          queue?: Track[];
          currentIndex?: number;
          volume?: number;
        };
        if (Array.isArray(saved.queue)) setQueueState(saved.queue);
        if (typeof saved.currentIndex === 'number') setCurrentIndex(saved.currentIndex);
        if (typeof saved.volume === 'number') setVolumeState(saved.volume);
      }
    } catch {
      // Ignore malformed guest player state.
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem('ekusupo-player', JSON.stringify({ queue, currentIndex, volume }));
  }, [hydrated, queue, currentIndex, volume]);

  useEffect(() => {
    const audio = new Audio();
    audio.volume = volume;
    audioRef.current = audio;

    const onTimeUpdate = () => setProgress(audio.currentTime);
    const onLoadedMetadata = () => setDuration(audio.duration || 0);
    const onEnded = () => {
      setIsPlaying(false);
      setCurrentIndex((index) => {
        const nextIndex = index + 1;
        if (nextIndex < queue.length) return nextIndex;
        return index;
      });
    };
    const onError = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);

    return () => {
      audio.pause();
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
    };
  }, [queue.length, volume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack?.mediaUrl) return;

    audio.src = currentTrack.mediaUrl;
    audio.load();
    if (isPlaying) {
      void audio.play().catch((error) => {
        console.error('Audio playback failed', error);
        setIsPlaying(false);
      });
    }
  }, [currentTrack, isPlaying]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  function setQueue(tracks: Track[], startIndex = 0) {
    setQueueState(tracks);
    setCurrentIndex(tracks.length ? Math.min(Math.max(startIndex, 0), tracks.length - 1) : -1);
    setIsPlaying(false);
    setProgress(0);
  }

  function playTrack(track: Track, nextQueue?: Track[]) {
    const sourceQueue = nextQueue ?? [track];
    const index = sourceQueue.findIndex((item) => item.id === track.id);
    setQueueState(sourceQueue);
    setCurrentIndex(index >= 0 ? index : 0);
    setIsPlaying(true);
    setProgress(0);
  }

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio || !currentTrack?.mediaUrl) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      void audio
        .play()
        .then(() => setIsPlaying(true))
        .catch((error) => {
          console.error('Audio playback failed', error);
          setIsPlaying(false);
        });
    }
  }

  function move(delta: number) {
    setCurrentIndex((index) => {
      const next = index + delta;
      if (next < 0 || next >= queue.length) return index;
      return next;
    });
    setIsPlaying(true);
    setProgress(0);
  }

  const value = useMemo<PlayerContextValue>(
    () => ({
      queue,
      currentTrack,
      currentIndex,
      isPlaying,
      progress,
      duration,
      volume,
      setQueue,
      playTrack,
      togglePlay,
      next: () => move(1),
      previous: () => move(-1),
      seek: (seconds) => {
        if (audioRef.current) {
          audioRef.current.currentTime = seconds;
          setProgress(seconds);
        }
      },
      setVolume: setVolumeState,
    }),
    [queue, currentTrack, currentIndex, isPlaying, progress, duration, volume],
  );

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function usePlayerContext() {
  const value = useContext(PlayerContext);
  if (!value) throw new Error('PlayerProvider is required');
  return value;
}
