export type TrackSource = 'demo' | 'live' | 'imported';

export interface Track {
  id: string;
  title: string;
  artist: string;
  album?: string;
  durationMs: number;
  artworkUrl?: string;
  mediaUrl?: string;
  mediaType?: 'audio' | 'video';
  provider: string;
  source: TrackSource;
  metadata?: Record<string, unknown>;
}
